import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash, randomBytes } from 'crypto'
import sql from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ok, error } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1).max(100),
  daily_limit: z.number().int().positive().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return error('Unauthorized', 401)
  const rows = await sql`
    SELECT id, name, key_prefix, daily_limit, sent_today, is_active, created_at, last_used_at
    FROM transactional_api_keys
    WHERE user_id = ${session.id}
    ORDER BY created_at DESC
  `
  return ok(rows)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return error('Unauthorized', 401)
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? 'Invalid', 422)
  const { name, daily_limit } = parsed.data
  const rawKey = `nm_live_${randomBytes(32).toString('hex')}`
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 12) + '...'
  const rows = await sql`
    INSERT INTO transactional_api_keys (user_id, name, key_hash, key_prefix, daily_limit)
    VALUES (${session.id}, ${name}, ${keyHash}, ${keyPrefix}, ${daily_limit ?? null})
    RETURNING id, name, key_prefix, daily_limit, is_active, created_at
  `
  return ok({ ...rows[0], key: rawKey }, 201)
}
