export const maxDuration = 300

import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { getActiveSmtpServers } from '@/lib/smtp-balancer'
import { ok, error } from '@/lib/api'

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

// Seeds sending_queue in batches of 2000 for running campaigns that still have unseeded contacts
export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  const result = await withCronLock('seed_sending_queue', async () => {
    // Find running campaigns that still have contacts not yet in sending_queue
    const campaigns = await sql`
      SELECT c.id, c.user_id, c.list_id, c.use_all_servers, c.smtp_server_id
      FROM campaigns c
      WHERE c.status = 'running'
        AND EXISTS (
          SELECT 1 FROM email_list_contacts elc
          INNER JOIN global_email_cache gec
            ON gec.email = elc.email
            AND gec.verification_status IN ('valid', 'catch_all')
            AND gec.expires_at > NOW()
          WHERE elc.list_id = c.list_id
            AND elc.is_unsubscribed = false
            AND elc.is_bounced = false
            AND NOT EXISTS (
              SELECT 1 FROM campaign_recipients cr
              WHERE cr.campaign_id = c.id AND cr.email = elc.email
            )
        )
    `

    let totalSeeded = 0

    for (const campaign of campaigns) {
      const smtpServers = await getActiveSmtpServers(campaign.user_id)
      if (smtpServers.length === 0) continue
      const fallbackSmtp = smtpServers[0].id
      const useAll = campaign.use_all_servers !== false && !campaign.smtp_server_id

      // Get unsubscribes for this user
      const unsubscribed = await sql`SELECT email FROM unsubscribes WHERE user_id = ${campaign.user_id}`
      const unsubSet = new Set(unsubscribed.map((u: { email: string }) => u.email.toLowerCase()))

      // Get next 2000 unseeded contacts
      const contacts = await sql`
        SELECT elc.id, elc.email, elc.first_name, elc.last_name, elc.custom_fields
        FROM email_list_contacts elc
        INNER JOIN global_email_cache gec
          ON gec.email = elc.email
          AND gec.verification_status IN ('valid', 'catch_all')
          AND gec.expires_at > NOW()
        WHERE elc.list_id = ${campaign.list_id}
          AND elc.is_unsubscribed = false
          AND elc.is_bounced = false
          AND NOT EXISTS (
            SELECT 1 FROM campaign_recipients cr
            WHERE cr.campaign_id = ${campaign.id} AND cr.email = elc.email
          )
        LIMIT 2000
      `

      const eligible = contacts.filter((c: { email: string }) => !unsubSet.has(c.email.toLowerCase()))
      if (eligible.length === 0) {
        // No more contacts — check if all recipients are done and mark campaign completed
        const remaining = await sql`
          SELECT COUNT(*) AS cnt FROM sending_queue
          WHERE campaign_id = ${campaign.id} AND status IN ('pending', 'processing')
        `
        if (Number(remaining[0]?.cnt ?? 0) === 0) {
          await sql`UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = ${campaign.id} AND status = 'running'`
        }
        continue
      }

      // Bulk insert recipients + queue using unnest
      const contactIds   = eligible.map((c: { id: string }) => c.id)
      const emails       = eligible.map((c: { email: string }) => c.email)
      const firstNames   = eligible.map((c: { first_name: string | null }) => c.first_name ?? '')
      const lastNames    = eligible.map((c: { last_name: string | null }) => c.last_name ?? '')
      const customFields = eligible.map((c: { custom_fields: unknown }) => JSON.stringify(c.custom_fields || {}))
      const smtpIds      = eligible.map((_: unknown, i: number) =>
        useAll ? smtpServers[i % smtpServers.length].id : (campaign.smtp_server_id ?? fallbackSmtp)
      )

      const inserted = await sql`
        INSERT INTO campaign_recipients
          (campaign_id, contact_id, email, first_name, last_name, custom_fields, smtp_server_id)
        SELECT ${campaign.id},
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

      const recIds     = inserted.map((r: { id: string }) => r.id)
      const recSmtpIds = inserted.map((r: { smtp_server_id: string }) => r.smtp_server_id)

      await sql`
        INSERT INTO sending_queue (campaign_id, recipient_id, smtp_server_id, scheduled_at)
        SELECT ${campaign.id},
          unnest(${recIds}::uuid[]),
          unnest(${recSmtpIds}::uuid[]),
          NOW()
        ON CONFLICT DO NOTHING
      `

      totalSeeded += inserted.length
    }

    return { totalSeeded }
  })

  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
