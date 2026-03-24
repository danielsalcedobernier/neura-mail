import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { ok, error, unauthorized } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1).max(150),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(587),
  username: z.string().min(1),
  password: z.string().min(1),
  encryption: z.enum(['none', 'ssl', 'tls']).default('tls'),
  from_email: z.string().email(),
  from_name: z.string().optional(),
  max_per_minute: z.number().int().min(1).max(1000).default(10),
  max_per_hour: z.number().int().optional().nullable(),
  max_per_day: z.number().int().optional().nullable(),
  warmup_enabled: z.boolean().optional().default(false),
  warmup_start_date: z.string().optional().nullable(),
  warmup_initial_per_minute: z.number().int().optional().nullable(),
  warmup_increment_per_minute: z.number().int().optional().nullable(),
  warmup_days_per_step: z.number().int().optional().nullable(),
  warmup_max_per_minute: z.number().int().optional().nullable(),
})

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const servers = await sql`
    SELECT id, name, host, port, username, encryption, from_email, from_name,
      max_per_minute, max_per_hour, max_per_day, is_active, is_dedicated,
      last_test_status, last_tested_at, sent_today, sent_this_hour, created_at,
      warmup_enabled, warmup_start_date, warmup_initial_per_minute,
      warmup_increment_per_minute, warmup_days_per_step, warmup_max_per_minute
    FROM smtp_servers
    WHERE user_id = ${session.id}
    ORDER BY created_at DESC
  `
  return ok(servers)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { password, ...rest } = parsed.data
    const password_encrypted = encrypt(password)

    const rows = await sql`
      INSERT INTO smtp_servers (
        user_id, name, host, port, username, password_encrypted,
        encryption, from_email, from_name, max_per_minute, max_per_hour, max_per_day,
        warmup_enabled, warmup_start_date, warmup_initial_per_minute,
        warmup_increment_per_minute, warmup_days_per_step, warmup_max_per_minute
      ) VALUES (
        ${session.id}, ${rest.name}, ${rest.host}, ${rest.port}, ${rest.username},
        ${password_encrypted}, ${rest.encryption}, ${rest.from_email},
        ${rest.from_name || null}, ${rest.max_per_minute},
        ${rest.max_per_hour || null}, ${rest.max_per_day || null},
        ${rest.warmup_enabled ?? false}, ${rest.warmup_start_date || null},
        ${rest.warmup_initial_per_minute || null}, ${rest.warmup_increment_per_minute || null},
        ${rest.warmup_days_per_step || null}, ${rest.warmup_max_per_minute || null}
      )
      RETURNING id, name, host, port, from_email, encryption, max_per_minute,
        warmup_enabled, created_at
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[smtp POST]', e)
    return error('Failed to save SMTP server', 500)
  }
}
