import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import sql from '@/lib/db'
import { ok, error, validationError } from '@/lib/api'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return validationError('Invalid input', parsed.error.flatten())
    }

    const { email, password, full_name } = parsed.data

    // Check if email already exists
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
    if (existing.length > 0) {
      return error('Email already registered', 409)
    }

    const password_hash = await bcrypt.hash(password, 10)

    const rows = await sql`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES (${email.toLowerCase()}, ${password_hash}, ${full_name}, 'client')
      RETURNING id
    `

    const userId = rows[0].id

    // Initialize credit balance
    await sql`
      INSERT INTO user_credits (user_id, balance) VALUES (${userId}, 0)
      ON CONFLICT DO NOTHING
    `

    return ok({ id: userId }, 201)
  } catch (err) {
    console.error('[auth/register]', err)
    return error('Registration failed', 500)
  }
}
