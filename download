import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const lists = await sql`
    SELECT el.*, COUNT(elc.id) as contact_count
    FROM email_lists el
    LEFT JOIN email_list_contacts elc ON elc.list_id = el.id
    WHERE el.id = ${id} AND el.user_id = ${session.id}
    GROUP BY el.id
  `
  if (!lists[0]) return notFound('List')
  return ok(lists[0])
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`
    DELETE FROM email_lists WHERE id = ${id} AND user_id = ${session.id} RETURNING id
  `
  if (!rows[0]) return notFound('List')
  return ok({ deleted: true })
}
