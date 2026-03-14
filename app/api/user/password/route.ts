import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, validationError } from '@/lib/api'

const schema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return validationError('Invalid input', parsed.error.flatten())

    const { current_password, new_password } = parsed.data

    // Verify current password
    const rows = await sql`SELECT password_hash FROM users WHERE id = ${session.id}`
    const user = rows[0]
    if (!user) return error('User not found', 404)

    const valid = await bcrypt.compare(current_password, user.password_hash)
    if (!valid) return error('Current password is incorrect', 400)

    const hash = await bcrypt.hash(new_password, 12)
    await sql`UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE id = ${session.id}`

    return ok({ updated: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') return error('Unauthorized', 401)
    console.error('[user/password POST]', err)
    return error('Failed to change password', 500)
  }
}
