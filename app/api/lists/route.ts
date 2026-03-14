import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
})

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const lists = await sql`
    SELECT id, name, description, status, total_count, valid_count, invalid_count,
           unverified_count, processing_progress, file_name, file_size_bytes,
           created_at, updated_at
    FROM email_lists
    WHERE user_id = ${session.id}
    ORDER BY created_at DESC
  `
  return ok(lists)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { name, description } = parsed.data
    const rows = await sql`
      INSERT INTO email_lists (user_id, name, description, status)
      VALUES (${session.id}, ${name}, ${description || null}, 'pending')
      RETURNING id, name, status, created_at
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[lists POST]', e)
    return error('Failed to create list', 500)
  }
}
