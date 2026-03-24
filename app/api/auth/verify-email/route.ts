import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { ok, serverError } from '@/lib/api'

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const users = await sql`
      SELECT id FROM users
      WHERE verification_token = ${token}
    `
    if (!users[0]) {
      return NextResponse.json({ error: 'Invalid or already used verification link' }, { status: 400 })
    }

    await sql`
      UPDATE users
      SET email_verified = true,
          verification_token = NULL
      WHERE id = ${users[0].id}
    `

    return NextResponse.json(ok({ verified: true }))
  } catch (err) {
    console.error('[verify-email]', err)
    return NextResponse.json(serverError('Verification failed'), { status: 500 })
  }
}
