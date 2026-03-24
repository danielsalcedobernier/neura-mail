import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, validationError, created } from '@/lib/api'

const schema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  type: z.enum(['info', 'warning', 'error', 'success']).default('info'),
  broadcast: z.boolean().default(false),
  user_id: z.string().uuid().optional(),
})

export async function GET() {
  try {
    await requireAdmin()
    const rows = await sql`
      SELECT n.*, u.email as user_email
      FROM notifications n
      LEFT JOIN users u ON u.id = n.user_id
      ORDER BY n.created_at DESC LIMIT 50
    `
    return ok(rows)
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    return error('Failed to load notifications', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return validationError('Invalid input', parsed.error.flatten())
    const { title, message, type, broadcast, user_id } = parsed.data
    if (broadcast) {
      await sql`INSERT INTO notifications (title, message, type, user_id) SELECT ${title}, ${message}, ${type}, id FROM users`
    } else if (user_id) {
      await sql`INSERT INTO notifications (title, message, type, user_id) VALUES (${title}, ${message}, ${type}, ${user_id})`
    } else {
      return error('Must provide user_id or set broadcast=true', 400)
    }
    return created({ sent: true })
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    return error('Failed to send notification', 500)
  }
}
