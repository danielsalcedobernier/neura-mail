import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import sql from '@/lib/db'
import { sendEmail, resetPasswordEmailHtml } from '@/lib/email'
import { ok, serverError } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const users = await sql`SELECT id, email FROM users WHERE email = ${email.toLowerCase().trim()}`
    // Always return success to prevent email enumeration
    if (!users[0]) return NextResponse.json(ok(null))

    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await sql`
      UPDATE users
      SET reset_token = ${token}, reset_token_expires_at = ${expires.toISOString()}
      WHERE id = ${users[0].id}
    `

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    await sendEmail({
      to: users[0].email as string,
      subject: 'Reset your NeuraMail password',
      html: resetPasswordEmailHtml(resetUrl),
    })

    return NextResponse.json(ok(null))
  } catch (err) {
    console.error('[forgot-password]', err)
    return NextResponse.json(serverError('Failed to send reset email'), { status: 500 })
  }
}
