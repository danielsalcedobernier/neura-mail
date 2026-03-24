import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import sql from '@/lib/db'
import { createSessionToken, setSessionCookie, SessionUser } from '@/lib/auth'
import { ok, error, validationError } from '@/lib/api'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return validationError('Invalid input', parsed.error.flatten())
    }

    const { email, password } = parsed.data

    const rows = await sql`
      SELECT id, email, password_hash, full_name, role, is_active, email_verified
      FROM users WHERE email = ${email.toLowerCase()}
    `

    const user = rows[0]
    if (!user || !user.is_active) {
      return error('Invalid email or password', 401)
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return error('Invalid email or password', 401)
    }

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    }

    const token = await createSessionToken(sessionUser)
    await setSessionCookie(token)

    // Create/update session record
    await sql`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (${token.slice(-32)}, ${user.id}, NOW() + INTERVAL '7 days')
      ON CONFLICT DO NOTHING
    `

    return ok({ role: user.role, full_name: user.full_name })
  } catch (err) {
    console.error('[auth/login]', err)
    return error('Login failed', 500)
  }
}
