import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ok, error } from '@/lib/api'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return error('Unauthorized', 401)
  const page = Number(request.nextUrl.searchParams.get('page') ?? 1)
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 50)
  const offset = (page - 1) * limit
  const rows = await sql`
    SELECT e.id, e.from_email, e.to_emails, e.subject, e.status,
      e.error_message, e.sent_at, e.created_at,
      k.name AS api_key_name
    FROM transactional_emails e
    LEFT JOIN transactional_api_keys k ON k.id = e.api_key_id
    WHERE e.user_id = ${session.id}
    ORDER BY e.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  const countRows = await sql`SELECT COUNT(*) FROM transactional_emails WHERE user_id = ${session.id}`
  return ok({ emails: rows, total: Number(countRows[0].count), page, limit })
}
