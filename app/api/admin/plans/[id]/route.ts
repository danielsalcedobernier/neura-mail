import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden, notFound } from '@/lib/api'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }
  const { id } = await params
  try {
    const body = await request.json()
    const {
      name, description, price_usd, credits_included, max_smtp_servers,
      max_email_lists, max_contacts_per_list, max_campaigns_per_month,
      max_recipients_per_campaign, can_use_ai, can_use_api, can_use_dedicated_smtp,
      duration_days, is_active, sort_order,
    } = body

    await sql`
      UPDATE plans SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        price_usd = COALESCE(${price_usd ?? null}, price_usd),
        credits_included = COALESCE(${credits_included ?? null}, credits_included),
        max_smtp_servers = COALESCE(${max_smtp_servers ?? null}, max_smtp_servers),
        max_email_lists = COALESCE(${max_email_lists ?? null}, max_email_lists),
        max_contacts_per_list = COALESCE(${max_contacts_per_list ?? null}, max_contacts_per_list),
        max_campaigns_per_month = COALESCE(${max_campaigns_per_month ?? null}, max_campaigns_per_month),
        max_recipients_per_campaign = COALESCE(${max_recipients_per_campaign ?? null}, max_recipients_per_campaign),
        can_use_ai = COALESCE(${can_use_ai ?? null}, can_use_ai),
        can_use_api = COALESCE(${can_use_api ?? null}, can_use_api),
        can_use_dedicated_smtp = COALESCE(${can_use_dedicated_smtp ?? null}, can_use_dedicated_smtp),
        duration_days = COALESCE(${duration_days ?? null}, duration_days),
        is_active = COALESCE(${is_active ?? null}, is_active),
        sort_order = COALESCE(${sort_order ?? null}, sort_order),
        updated_at = NOW()
      WHERE id = ${id}
    `
    return ok({ updated: true })
  } catch (e) {
    console.error('[admin/plans PATCH]', e)
    return error('Failed to update plan', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }
  const { id } = await params

  const rows = await sql`
    DELETE FROM plans WHERE id = ${id}
    AND (SELECT COUNT(*) FROM user_plans WHERE plan_id = ${id} AND status = 'active') = 0
    RETURNING id
  `
  if (!rows[0]) return notFound('Plan (or it has active subscribers)')
  return ok({ deleted: true })
}
