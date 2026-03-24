import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden, notFound } from '@/lib/api'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return forbidden() }
  const { id } = await params
  try {
    const body = await request.json()
    const { name, description, price_usd, credits, max_smtp_servers, max_campaigns, emails_per_month, is_active, sort_order, type } = body

    const rows = await sql`
      UPDATE plans SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        price_usd = COALESCE(${price_usd ?? null}, price_usd),
        credits = COALESCE(${credits ?? null}, credits),
        max_smtp_servers = COALESCE(${max_smtp_servers ?? null}, max_smtp_servers),
        max_campaigns = COALESCE(${max_campaigns ?? null}, max_campaigns),
        emails_per_month = COALESCE(${emails_per_month ?? null}, emails_per_month),
        is_active = COALESCE(${is_active ?? null}, is_active),
        sort_order = COALESCE(${sort_order ?? null}, sort_order),
        type = COALESCE(${type ?? null}, type)
      WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) return notFound('Plan')
    return ok(rows[0])
  } catch (e) {
    console.error('[admin/plans PATCH]', e)
    return error('Failed to update plan', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return forbidden() }
  const { id } = await params

  const rows = await sql`
    DELETE FROM plans WHERE id = ${id}
    AND (SELECT COUNT(*) FROM user_plans WHERE plan_id = ${id} AND status = 'active') = 0
    RETURNING id
  `
  if (!rows[0]) return notFound('Plan (or it has active subscribers)')
  return ok({ deleted: true })
}
