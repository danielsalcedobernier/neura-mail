import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

const planSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price_usd: z.number().min(0),
  credits_included: z.number().int().min(0),
  max_smtp_servers: z.number().int().min(0).default(1),
  max_email_lists: z.number().int().min(0).default(5),
  max_contacts_per_list: z.number().int().min(0).default(10000),
  max_campaigns_per_month: z.number().int().min(0).default(10),
  max_recipients_per_campaign: z.number().int().min(0).default(5000),
  can_use_ai: z.boolean().default(false),
  can_use_api: z.boolean().default(false),
  can_use_dedicated_smtp: z.boolean().default(false),
  duration_days: z.number().int().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }

  const plans = await sql`
    SELECT p.*,
      (SELECT COUNT(*) FROM user_plans up WHERE up.plan_id = p.id AND up.status = 'active') as active_users
    FROM plans p
    ORDER BY sort_order ASC, price_usd ASC
  `
  return ok(plans)
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }

  try {
    const body = await request.json()
    const parsed = planSchema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const d = parsed.data
    const rows = await sql`
      INSERT INTO plans (
        name, description, price_usd, credits_included,
        max_smtp_servers, max_email_lists, max_contacts_per_list,
        max_campaigns_per_month, max_recipients_per_campaign,
        can_use_ai, can_use_api, can_use_dedicated_smtp,
        duration_days, is_active, sort_order
      ) VALUES (
        ${d.name}, ${d.description || null}, ${d.price_usd}, ${d.credits_included},
        ${d.max_smtp_servers}, ${d.max_email_lists}, ${d.max_contacts_per_list},
        ${d.max_campaigns_per_month}, ${d.max_recipients_per_campaign},
        ${d.can_use_ai}, ${d.can_use_api}, ${d.can_use_dedicated_smtp},
        ${d.duration_days || null}, ${d.is_active}, ${d.sort_order}
      )
      RETURNING *
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[admin/plans POST]', e)
    return error('Failed to create plan', 500)
  }
}
