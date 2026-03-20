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

  // Fetch contacts
  const contacts = campaign.only_verified
    ? await sql`
        SELECT id, email, first_name, last_name, custom_fields
        FROM email_list_contacts
        WHERE list_id = ${campaign.list_id}
          AND verification_status IN ('valid', 'catch_all')
          AND is_unsubscribed = false AND is_bounced = false`
    : await sql`
        SELECT id, email, first_name, last_name, custom_fields
        FROM email_list_contacts
        WHERE list_id = ${campaign.list_id}
          AND is_unsubscribed = false AND is_bounced = false`

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

  // Insert recipients and sending_queue in batches
  const BATCH = 200
  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH)
    for (let j = 0; j < batch.length; j++) {
      const contact = batch[j]
      const smtpId = smtpAssignments.get(i + j)!
      const recRows = await sql`
        INSERT INTO campaign_recipients
          (campaign_id, contact_id, email, first_name, last_name, custom_fields, smtp_server_id)
        VALUES (${id}, ${contact.id}, ${contact.email}, ${contact.first_name}, ${contact.last_name},
                ${JSON.stringify(contact.custom_fields || {})}, ${smtpId})
        ON CONFLICT DO NOTHING
        RETURNING id
      `
      if (recRows[0]) {
        await sql`
          INSERT INTO sending_queue (campaign_id, recipient_id, smtp_server_id, scheduled_at)
          VALUES (${id}, ${recRows[0].id}, ${smtpId}, NOW())
          ON CONFLICT DO NOTHING
        `
      }
    }
  }

  return ok({
    started: true,
    totalRecipients: eligible.length,
    balancedAcrossServers: useAllServers ? smtpAssignments.size > 0 : false,
  })
}
