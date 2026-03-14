import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

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
  if (!campaign.smtp_server_id) return error('Campaign has no SMTP server assigned', 400)

  // Count recipients from the list
  const recipientQuery = campaign.only_verified
    ? sql`SELECT id, email, first_name, last_name, custom_fields
          FROM email_list_contacts
          WHERE list_id = ${campaign.list_id}
            AND verification_status IN ('valid', 'catch_all')
            AND is_unsubscribed = false AND is_bounced = false`
    : sql`SELECT id, email, first_name, last_name, custom_fields
          FROM email_list_contacts
          WHERE list_id = ${campaign.list_id}
            AND is_unsubscribed = false AND is_bounced = false`

  const contacts = await recipientQuery

  if (contacts.length === 0) {
    return error('No eligible recipients found for this campaign', 400)
  }

  // Also filter out global unsubscribes for this sender
  const unsubscribed = await sql`
    SELECT email FROM unsubscribes WHERE user_id = ${session.id}
  `
  const unsubSet = new Set(unsubscribed.map((u: { email: string }) => u.email.toLowerCase()))

  const eligible = contacts.filter((c: { email: string }) => !unsubSet.has(c.email.toLowerCase()))

  // Mark campaign as running & set total
  await sql`
    UPDATE campaigns SET
      status = 'running', started_at = NOW(),
      total_recipients = ${eligible.length}, updated_at = NOW()
    WHERE id = ${id}
  `

  // Insert recipients & sending queue in batches
  const BATCH = 200
  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH)
    for (const contact of batch) {
      const recRows = await sql`
        INSERT INTO campaign_recipients (campaign_id, contact_id, email, first_name, last_name, custom_fields, smtp_server_id)
        VALUES (${id}, ${contact.id}, ${contact.email}, ${contact.first_name}, ${contact.last_name},
                ${JSON.stringify(contact.custom_fields || {})}, ${campaign.smtp_server_id})
        ON CONFLICT DO NOTHING
        RETURNING id
      `
      if (recRows[0]) {
        await sql`
          INSERT INTO sending_queue (campaign_id, recipient_id, smtp_server_id, scheduled_at)
          VALUES (${id}, ${recRows[0].id}, ${campaign.smtp_server_id}, NOW())
          ON CONFLICT DO NOTHING
        `
      }
    }
  }

  return ok({ started: true, totalRecipients: eligible.length })
}
