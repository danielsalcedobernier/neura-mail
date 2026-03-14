import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'))
  const offset = parseInt(searchParams.get('offset') || '0')

  const users = search
    ? await sql`
        SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.email_verified,
               u.created_at, uc.balance as credits,
               (SELECT name FROM plans p JOIN user_plans up ON up.plan_id = p.id WHERE up.user_id = u.id AND up.status = 'active' LIMIT 1) as plan_name
        FROM users u
        LEFT JOIN user_credits uc ON uc.user_id = u.id
        WHERE u.email ILIKE ${'%' + search + '%'} OR u.full_name ILIKE ${'%' + search + '%'}
        ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.email_verified,
               u.created_at, uc.balance as credits,
               (SELECT p.name FROM plans p JOIN user_plans up ON up.plan_id = p.id WHERE up.user_id = u.id AND up.status = 'active' LIMIT 1) as plan_name
        FROM users u
        LEFT JOIN user_credits uc ON uc.user_id = u.id
        ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `

  const total = await sql`SELECT COUNT(*) as count FROM users`

  return ok({ users, total: Number(total[0].count), limit, offset })
}
