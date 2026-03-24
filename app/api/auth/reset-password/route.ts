import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import sql from '@/lib/db'
import { ok, serverError } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || !password) return NextResponse.json({ error: 'Token and password required' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const users = await sql`
      SELECT id FROM users
      WHERE reset_token = ${token}
        AND reset_token_expires_at > NOW()
    `
    if (!users[0]) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 })
    }

    const hashed = await bcrypt.hash(password, 12)

    await sql`
      UPDATE users
      SET password_hash = ${hashed},
          reset_token = NULL,
          reset_token_expires_at = NULL
      WHERE id = ${users[0].id}
    `

    return NextResponse.json(ok({ reset: true }))
  } catch (err) {
    console.error('[reset-password]', err)
    return NextResponse.json(serverError('Failed to reset password'), { status: 500 })
  }
}
