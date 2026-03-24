import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price_usd: z.number().min(0),
  credits: z.number().int().min(0).default(0),
  max_smtp_servers: z.number().int().min(0).default(1),
  max_campaigns: z.number().int().min(0).default(10),
  emails_per_month: z.number().int().min(0).default(10000),
  features: z.record(z.unknown()).optional(),
  type: z.string().default('standard'),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

export async function GET() {
  try { await requireAdmin() } catch { return forbidden() }

  const plans = await sql`
    SELECT p.*,
      (SELECT COUNT(*) FROM user_plans up WHERE up.plan_id = p.id AND up.status = 'active') as active_users
    FROM plans p
    ORDER BY sort_order ASC, price_usd ASC
  `
  return ok(plans)
}

export async function POST(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const d = parsed.data
    const rows = await sql`
      INSERT INTO plans (
        name, description, price_usd, credits,
        max_smtp_servers, max_campaigns, emails_per_month,
        features, type, is_active, sort_order
      ) VALUES (
        ${d.name}, ${d.description || null}, ${d.price_usd}, ${d.credits},
        ${d.max_smtp_servers}, ${d.max_campaigns}, ${d.emails_per_month},
        ${JSON.stringify(d.features || {})}, ${d.type}, ${d.is_active}, ${d.sort_order}
      )
      RETURNING *
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[admin/plans POST]', e)
    return error('Failed to create plan', 500)
  }
}
