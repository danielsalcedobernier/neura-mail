import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import sql from '@/lib/db'
import { ok, error, validationError } from '@/lib/api'
import { sendEmail, verificationEmailHtml } from '@/lib/email'

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
    const verification_token = randomBytes(32).toString('hex')

    const rows = await sql`
      INSERT INTO users (email, password_hash, full_name, role, verification_token, email_verified)
      VALUES (${email.toLowerCase()}, ${password_hash}, ${full_name}, 'client', ${verification_token}, false)
      RETURNING id, email
    `

    const userId = rows[0].id
    const FREE_CREDITS = 1000

    // Initialize credit balance with 1,000 free welcome credits
    await sql`
      INSERT INTO user_credits (user_id, balance, total_purchased, total_used)
      VALUES (${userId}, ${FREE_CREDITS}, ${FREE_CREDITS}, 0)
      ON CONFLICT (user_id) DO NOTHING
    `

    // Record the welcome bonus transaction
    await sql`
      INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
      VALUES (${userId}, ${FREE_CREDITS}, 'bonus', 'Welcome bonus — 1,000 free credits', ${FREE_CREDITS})
    `

    // Send verification email (fire-and-forget — don't fail registration if email fails)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const verifyUrl = `${baseUrl}/verify-email?token=${verification_token}`
      await sendEmail({
        to: rows[0].email as string,
        subject: 'Verify your NeuraMail email address',
        html: verificationEmailHtml(verifyUrl),
      })
    } catch (emailErr) {
      console.error('[register] Failed to send verification email:', emailErr)
    }

    return ok({ id: userId }, 201)
  } catch (err) {
    console.error('[auth/register]', err)
    return error('Registration failed', 500)
  }
}
