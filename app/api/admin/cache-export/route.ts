import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') ?? 'chunk'
    const source = searchParams.get('source') ?? 'cache'
    const listId = searchParams.get('listId') ?? null
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100000', 10), 100000)
    const validatedOnly = searchParams.get('validatedOnly') === 'true'
    const VALID_STATUSES = ['valid', 'catch_all']

    if (action === 'count') {
      if (source === 'list' && listId) {
        const rows = validatedOnly
          ? await sql`SELECT COUNT(*) AS c FROM email_list_contacts WHERE list_id = ${listId} AND verification_status = ANY(${VALID_STATUSES})`
          : await sql`SELECT COUNT(*) AS c FROM email_list_contacts WHERE list_id = ${listId}`
        return ok({ count: Number(rows[0].c) })
      } else {
        const rows = validatedOnly
          ? await sql`SELECT COUNT(*) AS c FROM global_email_cache WHERE expires_at > NOW() AND verification_status = ANY(${VALID_STATUSES})`
          : await sql`SELECT COUNT(*) AS c FROM global_email_cache WHERE expires_at > NOW()`
        return ok({ count: Number(rows[0].c) })
      }
    }

    if (source === 'list' && listId) {
      const rows = validatedOnly
        ? await sql`SELECT elc.email, elc.verification_status AS status, elc.verification_score AS score FROM email_list_contacts elc WHERE elc.list_id = ${listId} AND elc.verification_status = ANY(${VALID_STATUSES}) ORDER BY elc.id LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT elc.email, elc.verification_status AS status, elc.verification_score AS score FROM email_list_contacts elc WHERE elc.list_id = ${listId} ORDER BY elc.id LIMIT ${limit} OFFSET ${offset}`
      return ok({ rows, hasMore: rows.length === limit })
    } else {
      const rows = validatedOnly
        ? await sql`SELECT email, verification_status AS status, verification_score AS score, is_disposable, is_catch_all, provider, verified_at, hit_count FROM global_email_cache WHERE expires_at > NOW() AND verification_status = ANY(${VALID_STATUSES}) ORDER BY email LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT email, verification_status AS status, verification_score AS score, is_disposable, is_catch_all, provider, verified_at, hit_count FROM global_email_cache WHERE expires_at > NOW() ORDER BY email LIMIT ${limit} OFFSET ${offset}`
      return ok({ rows, hasMore: rows.length === limit })
    }
  } catch (e) {
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const body = await req.json()
    const search = (body.search ?? '') as string
    const lists = await sql`
      SELECT el.id, el.name, el.total_count, u.email AS user_email, u.full_name AS user_name
      FROM email_lists el
      JOIN users u ON u.id = el.user_id
      WHERE (el.name ILIKE ${'%' + search + '%'} OR u.email ILIKE ${'%' + search + '%'})
      ORDER BY el.total_count DESC NULLS LAST
      LIMIT 200
    `
    return ok(lists)
  } catch (e) {
    return serverError(e)
  }
}
