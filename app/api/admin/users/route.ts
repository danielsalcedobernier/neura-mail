import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

export async function POST(request: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }

  try {
    const { email, full_name, password, role = 'client' } = await request.json()
    if (!email || !password) return error('Email and password are required', 400)
    if (password.length < 8) return error('Password must be at least 8 characters', 400)

    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`
    if (existing[0]) return error('Email already in use', 409)

    const password_hash = await bcrypt.hash(password, 12)
    const validRoles = ['admin', 'client', 'worker']
    if (!validRoles.includes(role)) return error('Invalid role', 400)

    const [user] = await sql`
      INSERT INTO users (email, full_name, password_hash, role, is_active, email_verified)
      VALUES (${email.toLowerCase().trim()}, ${full_name || null}, ${password_hash}, ${role}, true, true)
      RETURNING id, email, full_name, role
    `

    // Workers don't need credits — they only access the verification worker
    if (role !== 'worker') {
      const FREE_CREDITS = 1000
      await sql`
        INSERT INTO user_credits (user_id, balance, total_purchased, total_used)
        VALUES (${user.id}, ${FREE_CREDITS}, ${FREE_CREDITS}, 0)
      `
      await sql`
        INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
        VALUES (${user.id}, ${FREE_CREDITS}, 'bonus', 'Welcome bonus — created by admin', ${FREE_CREDITS})
      `
    }

    return ok(user)
  } catch (e) {
    console.error('[admin/users POST]', e)
    return error('Failed to create user', 500)
  }
}

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
