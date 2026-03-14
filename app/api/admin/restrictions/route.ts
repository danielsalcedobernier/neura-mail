import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1),
  rule_type: z.enum(['domain', 'ip', 'country', 'email_pattern', 'rate_limit', 'global']),
  domain_pattern: z.string().optional().nullable(),
  max_per_minute: z.number().int().min(0).optional().nullable(),
  max_per_hour: z.number().int().min(0).optional().nullable(),
  max_per_day: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  applies_to: z.enum(['all_users', 'plan', 'specific_user']).default('all_users'),
  plan_id: z.string().uuid().optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
})

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }

  const restrictions = await sql`
    SELECT sr.*, p.name as plan_name, u.email as user_email
    FROM sending_restrictions sr
    LEFT JOIN plans p ON p.id = sr.plan_id
    LEFT JOIN users u ON u.id = sr.user_id
    ORDER BY sr.created_at DESC
  `
  return ok(restrictions)
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const d = parsed.data
    const rows = await sql`
      INSERT INTO sending_restrictions (
        name, rule_type, domain_pattern, max_per_minute, max_per_hour, max_per_day,
        is_active, applies_to, plan_id, user_id, notes
      ) VALUES (
        ${d.name}, ${d.rule_type}, ${d.domain_pattern || null},
        ${d.max_per_minute ?? null}, ${d.max_per_hour ?? null}, ${d.max_per_day ?? null},
        ${d.is_active}, ${d.applies_to}, ${d.plan_id || null}, ${d.user_id || null},
        ${d.notes || null}
      )
      RETURNING *
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[admin/restrictions POST]', e)
    return error('Failed to create restriction', 500)
  }
}
