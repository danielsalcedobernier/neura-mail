import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return forbidden() }
  const { id } = await params
  const body = await request.json()

  const rows = await sql`
    UPDATE api_connections SET
      credentials   = COALESCE(${body.credentials ? JSON.stringify(body.credentials) : null}::jsonb, credentials),
      extra_config  = COALESCE(${body.extra_config ? JSON.stringify(body.extra_config) : null}::jsonb, extra_config),
      is_active     = COALESCE(${body.is_active ?? null}, is_active),
      notes         = COALESCE(${body.notes ?? null}, notes),
      updated_at    = NOW()
    WHERE id = ${id}
    RETURNING id, service_name, display_name, is_active, updated_at
  `
  if (!rows[0]) return error('Not found', 404)
  return ok(rows[0])
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return forbidden() }
  const { id } = await params
  await sql`DELETE FROM api_connections WHERE id = ${id}`
  return ok({ deleted: true })
}
