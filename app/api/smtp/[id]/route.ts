import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  try {
    const body = await request.json()
    const { password, ...rest } = body

    const updates: Record<string, unknown> = { ...rest, updated_at: new Date() }
    if (password) updates.password_encrypted = encrypt(password)

    // Build dynamic update
    const cols = Object.keys(updates)
    if (cols.length === 0) return error('No fields to update', 400)

    const { max_per_minute, max_per_hour, max_per_day, is_active, name } = rest

    await sql`
      UPDATE smtp_servers SET
        name = COALESCE(${name ?? null}, name),
        max_per_minute = COALESCE(${max_per_minute ?? null}, max_per_minute),
        max_per_hour = COALESCE(${max_per_hour ?? null}, max_per_hour),
        max_per_day = COALESCE(${max_per_day ?? null}, max_per_day),
        is_active = COALESCE(${is_active ?? null}, is_active),
        password_encrypted = COALESCE(${updates.password_encrypted ?? null}, password_encrypted),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${session.id}
    `
    return ok({ updated: true })
  } catch (e) {
    console.error('[smtp PATCH]', e)
    return error('Failed to update SMTP server', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`
    DELETE FROM smtp_servers WHERE id = ${id} AND user_id = ${session.id} RETURNING id
  `
  if (!rows[0]) return notFound('SMTP Server')
  return ok({ deleted: true })
}
