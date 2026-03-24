import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') ?? ''
    const lists = search
      ? await sql`
          SELECT el.id, el.name, el.status, el.total_count, el.valid_count, el.invalid_count,
            el.unverified_count, el.verified_at, el.created_at,
            u.email AS user_email, u.full_name AS user_name
          FROM email_lists el
          JOIN users u ON u.id = el.user_id
          WHERE el.name ILIKE ${'%' + search + '%'} OR u.email ILIKE ${'%' + search + '%'}
          ORDER BY el.created_at DESC LIMIT 200`
      : await sql`
          SELECT el.id, el.name, el.status, el.total_count, el.valid_count, el.invalid_count,
            el.unverified_count, el.verified_at, el.created_at,
            u.email AS user_email, u.full_name AS user_name
          FROM email_lists el
          JOIN users u ON u.id = el.user_id
          ORDER BY el.created_at DESC LIMIT 200`
    return ok(lists)
  } catch (e) {
    return serverError(e)
  }
}
