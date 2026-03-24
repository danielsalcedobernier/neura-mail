import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, unauthorized, error } from '@/lib/api'
import { randomBytes } from 'crypto'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const rows = await sql`SELECT api_key FROM users WHERE id = ${session.id}`
  return ok({ api_key: rows[0]?.api_key || null })
}

export async function POST() {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const newKey = `nm_${randomBytes(32).toString('hex')}`
    await sql`UPDATE users SET api_key = ${newKey}, updated_at = NOW() WHERE id = ${session.id}`
    return ok({ api_key: newKey })
  } catch (e) {
    console.error('[user/api-key POST]', e)
    return error('Failed to regenerate API key', 500)
  }
}
