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

    const {
      max_per_minute, max_per_hour, max_per_day, is_active, name,
      host, port, username, from_email, from_name, encryption,
      warmup_enabled,
      warmup_initial_per_minute, warmup_increment_per_minute,
      warmup_days_per_step, warmup_max_per_minute,
    } = rest

    // Convert empty string to null — Postgres rejects "" for timestamp fields
    const warmup_start_date = rest.warmup_start_date || null

    await sql`
      UPDATE smtp_servers SET
        name            = COALESCE(${name ?? null}, name),
        host            = COALESCE(${host ?? null}, host),
        port            = COALESCE(${port ?? null}, port),
        username        = COALESCE(${username ?? null}, username),
        from_email      = COALESCE(${from_email ?? null}, from_email),
        from_name       = COALESCE(${from_name ?? null}, from_name),
        encryption      = COALESCE(${encryption ?? null}, encryption),
        max_per_minute  = COALESCE(${max_per_minute ?? null}, max_per_minute),
        max_per_hour    = COALESCE(${max_per_hour ?? null}, max_per_hour),
        max_per_day     = COALESCE(${max_per_day ?? null}, max_per_day),
        is_active       = COALESCE(${is_active ?? null}, is_active),
        password_encrypted = COALESCE(${updates.password_encrypted ?? null}, password_encrypted),
        warmup_enabled              = COALESCE(${warmup_enabled ?? null}, warmup_enabled),
        warmup_start_date           = COALESCE(${warmup_start_date ?? null}, warmup_start_date),
        warmup_initial_per_minute   = COALESCE(${warmup_initial_per_minute ?? null}, warmup_initial_per_minute),
        warmup_increment_per_minute = COALESCE(${warmup_increment_per_minute ?? null}, warmup_increment_per_minute),
        warmup_days_per_step        = COALESCE(${warmup_days_per_step ?? null}, warmup_days_per_step),
        warmup_max_per_minute       = COALESCE(${warmup_max_per_minute ?? null}, warmup_max_per_minute),
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
