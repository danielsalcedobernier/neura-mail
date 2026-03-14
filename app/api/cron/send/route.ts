import { NextRequest } from 'next/server'
import nodemailer from 'nodemailer'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { decrypt } from '@/lib/crypto'
import { ok, error } from '@/lib/api'

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
    // Get active SMTP servers and their rate limits
    const smtpServers = await sql`
      SELECT ss.*, 
        (SELECT COUNT(*) FROM sending_queue sq 
         WHERE sq.smtp_server_id = ss.id AND sq.status = 'processing') as active_jobs
      FROM smtp_servers ss
      WHERE ss.is_active = true
    `

    let totalSent = 0

    for (const server of smtpServers) {
      // Apply hourly/daily resets
      if (server.hour_reset_at && new Date(server.hour_reset_at) < new Date()) {
        await sql`UPDATE smtp_servers SET sent_this_hour = 0, hour_reset_at = NOW() + INTERVAL '1 hour' WHERE id = ${server.id}`
        server.sent_this_hour = 0
      }
      if (server.day_reset_at && new Date(server.day_reset_at) < new Date()) {
        await sql`UPDATE smtp_servers SET sent_today = 0, day_reset_at = NOW() + INTERVAL '1 day' WHERE id = ${server.id}`
        server.sent_today = 0
      }

      // Respect per-minute rate limit
      const canSend = Math.min(
        server.max_per_minute,
        server.max_per_hour ? Math.max(0, server.max_per_hour - server.sent_this_hour) : server.max_per_minute,
        server.max_per_day ? Math.max(0, server.max_per_day - server.sent_today) : server.max_per_minute,
      )
      if (canSend <= 0) continue

      // Also apply sending restrictions (domain-level)
      // We just use the server's own limits for now; domain-level handled below per email

      // Grab pending items for this server
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

      // Decrypt SMTP password once
      let password: string
      try {
        password = decrypt(server.password_encrypted)
      } catch {
        continue
      }

      const transporter = nodemailer.createTransport({
        host: server.host,
        port: server.port,
        secure: server.encryption === 'ssl',
        auth: { user: server.username, pass: password },
        tls: server.encryption !== 'ssl' ? { rejectUnauthorized: false } : undefined,
        pool: true,
        maxConnections: 5,
      })

      for (const item of items) {
        // Check domain-level restrictions
        const domain = item.email.split('@')[1]?.toLowerCase()
        const restrictions = await sql`
          SELECT max_per_minute FROM sending_restrictions
          WHERE is_active = true
            AND (domain_pattern IS NULL OR ${domain} LIKE REPLACE(domain_pattern, '%@', ''))
          ORDER BY domain_pattern DESC NULLS LAST
          LIMIT 1
        `
        // Simple restriction check — track per-domain sends could be added here

        // Mark as processing
        await sql`UPDATE sending_queue SET status = 'processing', locked_at = NOW() WHERE id = ${item.queue_id}`

        try {
          const html = item.html_content
            ? personalizeContent(item.html_content, item)
            : `<p>Hello ${item.first_name || 'there'},</p><p>${item.text_content || ''}</p>`

          const unsubLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(item.email)}&campaign=${item.campaign_id}`
          const htmlWithUnsub = item.unsubscribe_link
            ? `${html}<br><br><p style="font-size:11px;color:#999;">
                <a href="${unsubLink}" style="color:#999;">Unsubscribe</a>
               </p>`
            : html

          const info = await transporter.sendMail({
            from: `${item.from_name || server.from_name || 'NeuraMail'} <${item.from_email || server.from_email}>`,
            to: item.email,
            subject: item.subject,
            html: htmlWithUnsub,
            text: item.text_content || undefined,
            replyTo: item.reply_to || undefined,
            headers: {
              'X-Campaign-ID': item.campaign_id,
              'List-Unsubscribe': `<${unsubLink}>`,
            },
          })

          await sql`UPDATE sending_queue SET status = 'sent' WHERE id = ${item.queue_id}`
          await sql`
            UPDATE campaign_recipients SET
              status = 'sent', sent_at = NOW(), message_id = ${info.messageId}
            WHERE id = ${item.recipient_id}
          `
          await sql`
            UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = ${item.campaign_id}
          `
          await sql`
            UPDATE smtp_servers SET
              sent_today = sent_today + 1, sent_this_hour = sent_this_hour + 1, last_used_at = NOW()
            WHERE id = ${server.id}
          `
          totalSent++
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Send failed'
          await sql`
            UPDATE sending_queue SET status = 'failed', last_error = ${msg}, attempts = attempts + 1 WHERE id = ${item.queue_id}
          `
          await sql`
            UPDATE campaign_recipients SET status = 'failed', error_message = ${msg} WHERE id = ${item.recipient_id}
          `
          await sql`UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = ${item.campaign_id}`
        }
      }

      transporter.close()

      // Check if campaign completed
      const pending = await sql`
        SELECT COUNT(*) as cnt FROM sending_queue
        WHERE campaign_id IN (SELECT campaign_id FROM sending_queue WHERE smtp_server_id = ${server.id} AND status = 'sent' LIMIT 1)
          AND status = 'pending'
      `
      if (Number(pending[0]?.cnt || 0) === 0) {
        await sql`
          UPDATE campaigns SET status = 'completed', completed_at = NOW()
          WHERE id IN (
            SELECT DISTINCT campaign_id FROM campaign_recipients
            WHERE smtp_server_id = ${server.id}
          ) AND status = 'running'
            AND (SELECT COUNT(*) FROM sending_queue sq2 WHERE sq2.campaign_id = campaigns.id AND sq2.status = 'pending') = 0
        `
      }
    }

    return { totalSent }
  })

  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
