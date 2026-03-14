import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

const createSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  preview_text: z.string().max(255).optional(),
  from_name: z.string().optional(),
  from_email: z.string().email().optional(),
  reply_to: z.string().email().optional(),
  html_content: z.string().optional(),
  text_content: z.string().optional(),
  content_source: z.enum(['manual', 'ai_generated', 'imported']).default('manual'),
  list_id: z.string().uuid().optional().nullable(),
  smtp_server_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  only_verified: z.boolean().default(true),
  track_opens: z.boolean().default(true),
  track_clicks: z.boolean().default(true),
  sending_speed: z.number().int().min(1).max(1000).default(10),
})

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const campaigns = await sql`
    SELECT c.id, c.name, c.subject, c.status, c.scheduled_at, c.started_at,
           c.completed_at, c.total_recipients, c.sent_count, c.opened_count,
           c.clicked_count, c.bounced_count, c.failed_count, c.content_source,
           c.created_at, el.name as list_name, ss.name as smtp_name
    FROM campaigns c
    LEFT JOIN email_lists el ON el.id = c.list_id
    LEFT JOIN smtp_servers ss ON ss.id = c.smtp_server_id
    WHERE c.user_id = ${session.id}
    ORDER BY c.created_at DESC
  `
  return ok(campaigns)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const d = parsed.data
    const rows = await sql`
      INSERT INTO campaigns (
        user_id, name, subject, preview_text, from_name, from_email, reply_to,
        html_content, text_content, content_source, list_id, smtp_server_id,
        scheduled_at, only_verified, track_opens, track_clicks, sending_speed,
        status
      ) VALUES (
        ${session.id}, ${d.name}, ${d.subject}, ${d.preview_text || null},
        ${d.from_name || null}, ${d.from_email || null}, ${d.reply_to || null},
        ${d.html_content || null}, ${d.text_content || null}, ${d.content_source},
        ${d.list_id || null}, ${d.smtp_server_id || null},
        ${d.scheduled_at ? new Date(d.scheduled_at) : null},
        ${d.only_verified}, ${d.track_opens}, ${d.track_clicks}, ${d.sending_speed},
        ${d.scheduled_at ? 'scheduled' : 'draft'}
      )
      RETURNING id, name, status, created_at
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[campaigns POST]', e)
    return error('Failed to create campaign', 500)
  }
}
