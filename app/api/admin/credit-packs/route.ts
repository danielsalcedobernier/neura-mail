import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1),
  credits: z.number().int().min(1),
  bonus_credits: z.number().int().min(0).default(0),
  price_usd: z.number().positive(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

export async function GET() {
  try { await requireAdmin() } catch { return forbidden() }
  const packs = await sql`SELECT * FROM credit_packs ORDER BY sort_order ASC, price_usd ASC`
  return ok(packs)
}

export async function POST(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)
    const d = parsed.data
    const rows = await sql`
      INSERT INTO credit_packs (name, credits, bonus_credits, price_usd, is_active, sort_order)
      VALUES (${d.name}, ${d.credits}, ${d.bonus_credits}, ${d.price_usd}, ${d.is_active}, ${d.sort_order})
      RETURNING *
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[admin/credit-packs POST]', e)
    return error('Failed to create pack', 500)
  }
}

export async function PATCH(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const { id, ...fields } = await request.json()
    if (!id) return error('id required', 400)
    const rows = await sql`
      UPDATE credit_packs SET
        name = COALESCE(${fields.name ?? null}, name),
        credits = COALESCE(${fields.credits ?? null}, credits),
        bonus_credits = COALESCE(${fields.bonus_credits ?? null}, bonus_credits),
        price_usd = COALESCE(${fields.price_usd ?? null}, price_usd),
        is_active = COALESCE(${fields.is_active ?? null}, is_active),
        sort_order = COALESCE(${fields.sort_order ?? null}, sort_order)
      WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) return error('Pack not found', 404)
    return ok(rows[0])
  } catch (e) {
    console.error('[admin/credit-packs PATCH]', e)
    return error('Failed to update pack', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return error('id required', 400)
  await sql`DELETE FROM credit_packs WHERE id = ${id}`
  return ok({ deleted: true })
}
