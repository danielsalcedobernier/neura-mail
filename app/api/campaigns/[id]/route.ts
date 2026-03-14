import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`
    SELECT c.*, el.name as list_name, ss.name as smtp_name, ss.from_email as smtp_from
    FROM campaigns c
    LEFT JOIN email_lists el ON el.id = c.list_id
    LEFT JOIN smtp_servers ss ON ss.id = c.smtp_server_id
    WHERE c.id = ${id} AND c.user_id = ${session.id}
  `
  if (!rows[0]) return notFound('Campaign')
  return ok(rows[0])
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  try {
    const body = await request.json()
    const { name, subject, html_content, text_content, list_id, smtp_server_id,
            scheduled_at, sending_speed, only_verified, preview_text, from_name,
            from_email, reply_to, track_opens, track_clicks } = body

    await sql`
      UPDATE campaigns SET
        name = COALESCE(${name ?? null}, name),
        subject = COALESCE(${subject ?? null}, subject),
        preview_text = COALESCE(${preview_text ?? null}, preview_text),
        from_name = COALESCE(${from_name ?? null}, from_name),
        from_email = COALESCE(${from_email ?? null}, from_email),
        reply_to = COALESCE(${reply_to ?? null}, reply_to),
        html_content = COALESCE(${html_content ?? null}, html_content),
        text_content = COALESCE(${text_content ?? null}, text_content),
        list_id = COALESCE(${list_id ?? null}, list_id),
        smtp_server_id = COALESCE(${smtp_server_id ?? null}, smtp_server_id),
        scheduled_at = COALESCE(${scheduled_at ? new Date(scheduled_at) : null}, scheduled_at),
        sending_speed = COALESCE(${sending_speed ?? null}, sending_speed),
        only_verified = COALESCE(${only_verified ?? null}, only_verified),
        track_opens = COALESCE(${track_opens ?? null}, track_opens),
        track_clicks = COALESCE(${track_clicks ?? null}, track_clicks),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${session.id} AND status IN ('draft', 'scheduled')
    `
    return ok({ updated: true })
  } catch (e) {
    console.error('[campaigns PATCH]', e)
    return error('Failed to update campaign', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`
    DELETE FROM campaigns WHERE id = ${id} AND user_id = ${session.id}
    AND status IN ('draft', 'scheduled', 'cancelled')
    RETURNING id
  `
  if (!rows[0]) return notFound('Campaign')
  return ok({ deleted: true })
}
