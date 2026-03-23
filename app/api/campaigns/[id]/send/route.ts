export const maxDuration = 300

import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'
import { getActiveSmtpServers, allocate } from '@/lib/smtp-balancer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const campaigns = await sql`
    SELECT * FROM campaigns WHERE id = ${id} AND user_id = ${session.id}
  `
  if (!campaigns[0]) return notFound('Campaign')

  const campaign = campaigns[0]
  if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
    return error(`Campaign cannot be sent in status: ${campaign.status}`, 400)
  }
  if (!campaign.list_id) return error('Campaign has no email list assigned', 400)

  const useAllServers = campaign.use_all_servers !== false && !campaign.smtp_server_id

  // If not using the balancer, require a single SMTP server to be assigned
  if (!useAllServers && !campaign.smtp_server_id) {
    return error('Campaign has no SMTP server assigned', 400)
  }

  // Only send to contacts validated in the global cache (valid or catch_all, not expired)
  const contacts = await sql`
    SELECT elc.id, elc.email, elc.first_name, elc.last_name, elc.custom_fields
    FROM email_list_contacts elc
    INNER JOIN global_email_cache gec
      ON gec.email = elc.email
      AND gec.verification_status IN ('valid', 'catch_all')
      AND gec.expires_at > NOW()
    WHERE elc.list_id = ${campaign.list_id}
      AND elc.is_unsubscribed = false
      AND elc.is_bounced = false`

  if (contacts.length === 0) return error('No eligible recipients found for this campaign', 400)

  // Filter global unsubscribes
  const unsubscribed = await sql`SELECT email FROM unsubscribes WHERE user_id = ${session.id}`
  const unsubSet = new Set(unsubscribed.map((u: { email: string }) => u.email.toLowerCase()))
  const eligible = contacts.filter((c: { email: string }) => !unsubSet.has(c.email.toLowerCase()))

  if (eligible.length === 0) return error('All recipients are unsubscribed', 400)

  // Build per-recipient smtp assignment map
  let smtpAssignments: Map<number, string>  // index → smtp_server_id

  if (useAllServers) {
    const servers = await getActiveSmtpServers(session.id)
    if (servers.length === 0) return error('No active SMTP servers with available capacity', 400)

    const allocations = allocate(servers, eligible.length)
    if (allocations.length === 0) return error('No SMTP capacity available right now', 400)

    smtpAssignments = new Map()
    let idx = 0
    for (const alloc of allocations) {
      for (let n = 0; n < alloc.count; n++) {
        smtpAssignments.set(idx++, alloc.smtp_server_id)
      }
    }
  } else {
    // Single SMTP — assign to all
    smtpAssignments = new Map(eligible.map((_, i) => [i, campaign.smtp_server_id as string]))
  }

  // Update campaign status
  await sql`
    UPDATE campaigns SET
      status = 'running', started_at = NOW(),
      total_recipients = ${eligible.length}, updated_at = NOW()
    WHERE id = ${id}
  `

  // Fallback server for any recipient that didn't get assigned (e.g. allocate() returned fewer slots)
  const fallbackSmtpId = smtpAssignments.get(0) ?? null
  if (!fallbackSmtpId) return error('Failed to assign SMTP server to recipients', 500)

  // Bulk-insert campaign_recipients using unnest — one query per batch, no per-row awaits
  const BATCH = 500
  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH)

    const contactIds   = batch.map((c: { id: string }) => c.id)
    const emails       = batch.map((c: { email: string }) => c.email)
    const firstNames   = batch.map((c: { first_name: string | null }) => c.first_name ?? '')
    const lastNames    = batch.map((c: { last_name: string | null }) => c.last_name ?? '')
    const customFields = batch.map((c: { custom_fields: unknown }) => JSON.stringify(c.custom_fields || {}))
    const smtpIds      = batch.map((_: unknown, j: number) => smtpAssignments.get(i + j) ?? fallbackSmtpId)

    // Bulk insert recipients, get back ids in same order
    const inserted = await sql`
      INSERT INTO campaign_recipients
        (campaign_id, contact_id, email, first_name, last_name, custom_fields, smtp_server_id)
      SELECT
        ${id},
        unnest(${contactIds}::uuid[]),
        unnest(${emails}::text[]),
        unnest(${firstNames}::text[]),
        unnest(${lastNames}::text[]),
        unnest(${customFields}::jsonb[]),
        unnest(${smtpIds}::uuid[])
      ON CONFLICT DO NOTHING
      RETURNING id, smtp_server_id
    `

    if (inserted.length === 0) continue

    // Bulk insert sending_queue for all inserted recipients
    const recIds       = inserted.map((r: { id: string }) => r.id)
    const recSmtpIds   = inserted.map((r: { smtp_server_id: string }) => r.smtp_server_id)

    await sql`
      INSERT INTO sending_queue (campaign_id, recipient_id, smtp_server_id, scheduled_at)
      SELECT
        ${id},
        unnest(${recIds}::uuid[]),
        unnest(${recSmtpIds}::uuid[]),
        NOW()
      ON CONFLICT DO NOTHING
    `
  }

  return ok({
    started: true,
    totalRecipients: eligible.length,
    balancedAcrossServers: useAllServers ? smtpAssignments.size > 0 : false,
  })
}
