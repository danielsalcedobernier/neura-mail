import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  domain_pattern: z.string().optional().nullable(),
  provider_name: z.string().optional().nullable(),
  max_per_minute: z.number().int().min(0).optional().nullable(),
  max_per_hour: z.number().int().min(0).optional().nullable(),
  max_per_day: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  applies_to: z.enum(['all', 'domain', 'provider', 'user']).default('all'),
  target_id: z.string().uuid().optional().nullable(),
})

export async function GET() {
  try { await requireAdmin() } catch { return forbidden() }
  const restrictions = await sql`SELECT * FROM sending_restrictions ORDER BY created_at DESC`
  return ok(restrictions)
}

export async function POST(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)
    const d = parsed.data
    const rows = await sql`
      INSERT INTO sending_restrictions (name, description, domain_pattern, provider_name, max_per_minute, max_per_hour, max_per_day, is_active, applies_to, target_id)
      VALUES (${d.name}, ${d.description || null}, ${d.domain_pattern || null}, ${d.provider_name || null}, ${d.max_per_minute ?? null}, ${d.max_per_hour ?? null}, ${d.max_per_day ?? null}, ${d.is_active}, ${d.applies_to}, ${d.target_id || null})
      RETURNING *
    `
    return ok(rows[0], 201)
  } catch (e) {
    return error('Failed to create restriction', 500)
  }
}

export async function PATCH(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const body = await request.json()
    const { id, ...rest } = body
    if (!id) return error('ID required', 400)
    const rows = await sql`
      UPDATE sending_restrictions SET
        name = COALESCE(${rest.name ?? null}, name),
        description = COALESCE(${rest.description ?? null}, description),
        domain_pattern = COALESCE(${rest.domain_pattern ?? null}, domain_pattern),
        max_per_minute = COALESCE(${rest.max_per_minute ?? null}, max_per_minute),
        max_per_hour = COALESCE(${rest.max_per_hour ?? null}, max_per_hour),
        max_per_day = COALESCE(${rest.max_per_day ?? null}, max_per_day),
        is_active = COALESCE(${rest.is_active ?? null}, is_active),
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `
    return ok(rows[0])
  } catch (e) {
    return error('Failed to update restriction', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) return error('ID required', 400)
  await sql`DELETE FROM sending_restrictions WHERE id = ${id}`
  return ok({ deleted: true })
}
