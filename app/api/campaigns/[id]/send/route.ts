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

  const smtpServers = await getActiveSmtpServers(session.id)
  if (smtpServers.length === 0) return error('No active SMTP servers configured', 400)

  // Mark campaign as running — the seed cron will fill sending_queue in background batches
  await sql`
    UPDATE campaigns SET
      status = 'running',
      started_at = NOW(),
      updated_at = NOW(),
      smtp_server_id = ${useAllServers ? null : (campaign.smtp_server_id ?? smtpServers[0].id)},
      use_all_servers = ${useAllServers}
    WHERE id = ${id}
  `

  return ok({
    started: true,
    totalRecipients: contacts.length,
    balancedAcrossServers: useAllServers,
  })
}
