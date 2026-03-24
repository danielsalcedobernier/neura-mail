import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, validationError } from '@/lib/api'

const schema = z.object({
  full_name: z.string().min(1).max(200).optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return validationError('Invalid input', parsed.error.flatten())

    const { full_name } = parsed.data
    const rows = await sql`
      UPDATE users SET
        full_name = COALESCE(${full_name ?? null}, full_name),
        updated_at = NOW()
      WHERE id = ${session.id}
      RETURNING id, email, full_name, role
    `
    return ok(rows[0])
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') return error('Unauthorized', 401)
    console.error('[user/profile PATCH]', err)
    return error('Failed to update profile', 500)
  }
}
