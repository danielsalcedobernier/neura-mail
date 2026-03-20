import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ok, error } from '@/lib/api'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return error('Unauthorized', 401)
  const { id } = await params
  await sql`DELETE FROM transactional_api_keys WHERE id = ${id} AND user_id = ${session.id}`
  return ok({ deleted: true })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession(request)
  if (!session) return error('Unauthorized', 401)
  const { id } = await params
  const { is_active } = await request.json()
  const rows = await sql`
    UPDATE transactional_api_keys SET is_active = ${is_active}, updated_at = NOW()
    WHERE id = ${id} AND user_id = ${session.id}
    RETURNING id, name, is_active
  `
  return ok(rows[0])
}
