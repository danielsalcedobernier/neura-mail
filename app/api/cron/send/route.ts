export const maxDuration = 300

import { NextRequest } from 'next/server'
import nodemailer from 'nodemailer'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { decrypt } from '@/lib/crypto'
import { ok, error } from '@/lib/api'
import { getActiveSmtpServers } from '@/lib/smtp-balancer'

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function personalizeContent(html: string, contact: Record<string, unknown>): string {
  return html
    .replace(/\{\{first_name\}\}/gi, (contact.first_name as string) || 'there')
    .replace(/\{\{last_name\}\}/gi, (contact.last_name as string) || '')
    .replace(/\{\{email\}\}/gi, (contact.email as string) || '')
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  const result = await withCronLock('process_sending_queue', async () => {
    // Get all distinct user_ids that have pending items in the queue
    const activeUsers = await sql`
      SELECT DISTINCT ss.user_id
      FROM sending_queue sq
      JOIN smtp_servers ss ON ss.id = sq.smtp_server_id
      WHERE sq.status = 'pending' AND sq.scheduled_at <= NOW()
    `

    let totalSent = 0

    for (const { user_id } of activeUsers) {
      // Use the balancer to get fresh capacity-aware server list for this user
      const servers = await getActiveSmtpServers(user_id)

      for (const server of servers) {
        // capacity = min(max_per_minute, remaining_hour, remaining_day) — already computed
        const canSend = server.capacity
        if (canSend <= 0) continue

        // Grab pending items for this server up to its per-minute capacity
        const items = await sql`
          SELECT sq.id as queue_id, sq.campaign_id, sq.recipient_id,
                 cr.email, cr.first_name, cr.last_name,
                 c.subject, c.html_content, c.text_content, c.from_name, c.from_email,
                 c.reply_to, c.track_opens, c.track_clicks, c.unsubscribe_link,
                 c.user_id as campaign_user_id
          FROM sending_queue sq
          JOIN campaign_recipients cr ON cr.id = sq.recipient_id
          JOIN campaigns c ON c.id = sq.campaign_id
          WHERE sq.smtp_server_id = ${server.id}
            AND sq.status = 'pending'
            AND sq.scheduled_at <= NOW()
          ORDER BY sq.priority DESC, sq.scheduled_at ASC
          LIMIT ${canSend}
          FOR UPDATE SKIP LOCKED
        `

        if (items.length === 0) continue

        let password: string
        try {
          password = decrypt(server.password_encrypted)
        } catch {
          continue
        }

        const enc = server.encryption as string
        const transporter = nodemailer.createTransport({
          host: server.host,
          port: Number(server.port),
          secure: enc === 'ssl',
          ignoreTLS: enc === 'none',
          requireTLS: enc === 'tls',
          auth: { user: server.username, pass: password },
          tls: { rejectUnauthorized: false },
          pool: true,
          maxConnections: 5,
        })

        // Track domain-level restriction counters per domain within this tick
        const domainSentThisTick: Record<string, number> = {}

        for (const item of items) {
          const domain = (item.email as string).split('@')[1]?.toLowerCase() ?? ''

          // Check domain-level restriction if any applies
          const restrictions = await sql`
            SELECT max_per_minute FROM sending_restrictions
            WHERE is_active = true
              AND (domain_pattern IS NULL OR ${domain} LIKE domain_pattern)
            ORDER BY domain_pattern DESC NULLS LAST
            LIMIT 1
          `
          if (restrictions[0]) {
            const domainLimit = Number(restrictions[0].max_per_minute)
            const domainSent = domainSentThisTick[domain] ?? 0
            if (domainSent >= domainLimit) continue  // skip — domain quota hit for this tick
          }

          // Mark as processing
          await sql`UPDATE sending_queue SET status = 'processing', locked_at = NOW() WHERE id = ${item.queue_id}`

          try {
            const html = item.html_content
              ? personalizeContent(item.html_content as string, item)
              : `<p>Hello ${item.first_name || 'there'},</p><p>${item.text_content || ''}</p>`

            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
            const unsubLink = `${baseUrl}/unsubscribe?email=${encodeURIComponent(item.email as string)}&campaign=${item.campaign_id}`
            const htmlWithUnsub = item.unsubscribe_link
              ? `${html}<br><br><p style="font-size:11px;color:#999;"><a href="${unsubLink}" style="color:#999;">Unsubscribe</a></p>`
              : html

            const info = await transporter.sendMail({
              from: `${item.from_name || server.from_name || 'NeuraMail'} <${item.from_email || server.from_email}>`,
              to: item.email as string,
              subject: item.subject as string,
              html: htmlWithUnsub,
              text: (item.text_content as string) || undefined,
              replyTo: (item.reply_to as string) || undefined,
              headers: {
                'X-Campaign-ID': item.campaign_id as string,
                'List-Unsubscribe': `<${unsubLink}>`,
              },
            })

            await sql`UPDATE sending_queue SET status = 'sent' WHERE id = ${item.queue_id}`
            await sql`
              UPDATE campaign_recipients SET
                status = 'sent', sent_at = NOW(), message_id = ${info.messageId}
              WHERE id = ${item.recipient_id}
            `
            await sql`UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = ${item.campaign_id}`
            await sql`
              UPDATE smtp_servers SET
                sent_today    = sent_today    + 1,
                sent_this_hour = sent_this_hour + 1,
                last_used_at  = NOW()
              WHERE id = ${server.id}
            `

            domainSentThisTick[domain] = (domainSentThisTick[domain] ?? 0) + 1
            totalSent++
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Send failed'
            await sql`UPDATE sending_queue SET status = 'failed', last_error = ${msg}, attempts = attempts + 1 WHERE id = ${item.queue_id}`
            await sql`UPDATE campaign_recipients SET status = 'failed', error_message = ${msg} WHERE id = ${item.recipient_id}`
            await sql`UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = ${item.campaign_id}`
          }
        }

        transporter.close()

        // Mark each campaign completed if it has no more pending/processing items
        const campaignIds = [...new Set(items.map((i: { campaign_id: string }) => i.campaign_id))]
        for (const campaignId of campaignIds) {
          const remaining = await sql`
            SELECT COUNT(*) AS cnt FROM sending_queue
            WHERE campaign_id = ${campaignId} AND status IN ('pending', 'processing')
          `
          if (Number(remaining[0]?.cnt ?? 1) === 0) {
            await sql`
              UPDATE campaigns SET status = 'completed', completed_at = NOW()
              WHERE id = ${campaignId} AND status = 'running'
            `
          }
        }
      }
    }

    return { totalSent }
  })

  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
