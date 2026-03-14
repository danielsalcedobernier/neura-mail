import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import sql from './db'

const JWT_SECRET = process.env.JWT_SECRET || 'neuramail-dev-secret-replace-in-production-must-be-long'
const SECRET = new TextEncoder().encode(JWT_SECRET)
const COOKIE_NAME = 'nm_session'

export interface SessionUser {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'client'
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return (payload as { user: SessionUser }).user
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw new Error('UNAUTHORIZED')
  }
  return session
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireAuth()
  if (session.role !== 'admin') {
    throw new Error('FORBIDDEN')
  }
  return session
}

export async function getUserById(id: string) {
  const rows = await sql`
    SELECT id, email, full_name, role, is_active, email_verified, api_key, created_at
    FROM users WHERE id = ${id} AND is_active = true
  `
  return rows[0] || null
}

export async function getUserCredits(userId: string): Promise<number> {
  const rows = await sql`
    SELECT balance FROM user_credits WHERE user_id = ${userId}
  `
  return rows[0]?.balance ?? 0
}
