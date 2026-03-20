import { NextRequest } from 'next/server'
import nodemailer from 'nodemailer'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`
    SELECT * FROM smtp_servers WHERE id = ${id} AND user_id = ${session.id}
  `
  if (!rows[0]) return notFound('SMTP Server')

  const server = rows[0]
  try {
    const password = decrypt(server.password_encrypted)

    const enc = server.encryption as string
    const transporter = nodemailer.createTransport({
      host: server.host,
      port: Number(server.port),
      secure: enc === 'ssl',                          // true = port 465 implicit SSL
      ignoreTLS: enc === 'none',                      // disable STARTTLS entirely
      requireTLS: enc === 'tls',                      // force STARTTLS on port 587
      auth: { user: server.username, pass: password },
      tls: { rejectUnauthorized: false },             // accept self-signed certs
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    })

    await transporter.verify()

    await sql`
      UPDATE smtp_servers SET last_test_status = 'success', last_tested_at = NOW()
      WHERE id = ${id}
    `
    return ok({ status: 'success', message: 'SMTP connection verified successfully' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed'
    await sql`
      UPDATE smtp_servers SET last_test_status = 'failed', last_tested_at = NOW()
      WHERE id = ${id}
    `
    return error(`SMTP test failed: ${msg}`, 400)
  }
}
