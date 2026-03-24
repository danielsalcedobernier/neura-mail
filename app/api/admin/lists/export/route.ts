import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()

  const { searchParams } = new URL(request.url)
  const listId = searchParams.get('listId')
  const action = searchParams.get('action') ?? 'chunk'
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100000', 10), 100000)
  const validatedOnly = searchParams.get('validatedOnly') === 'true'

  if (!listId) return error('listId required', 400)

  const VALID_STATUSES = ['valid', 'catch_all']

  if (action === 'count') {
    const rows = validatedOnly
      ? await sql`SELECT COUNT(*) AS c FROM email_list_contacts WHERE list_id = ${listId} AND verification_status = ANY(${VALID_STATUSES})`
      : await sql`SELECT COUNT(*) AS c FROM email_list_contacts WHERE list_id = ${listId}`
    return ok({ count: Number(rows[0].c) })
  }

  const rows = validatedOnly
    ? await sql`SELECT email, first_name, last_name, verification_status AS status FROM email_list_contacts WHERE list_id = ${listId} AND verification_status = ANY(${VALID_STATUSES}) ORDER BY id LIMIT ${limit} OFFSET ${offset}`
    : await sql`SELECT email, first_name, last_name, verification_status AS status FROM email_list_contacts WHERE list_id = ${listId} ORDER BY id LIMIT ${limit} OFFSET ${offset}`

  return ok({ rows, hasMore: rows.length === limit })
}
