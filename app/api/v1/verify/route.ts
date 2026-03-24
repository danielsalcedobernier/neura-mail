import { NextRequest } from 'next/server'
import { z } from 'zod'
import sql from '@/lib/db'
import { checkCacheFirst, verifyEmail, storeInCache } from '@/lib/mailsso'
import { ok, error } from '@/lib/api'

const schema = z.object({ email: z.string().email() })

async function authenticateApiKey(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const apiKey = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : request.nextUrl.searchParams.get('api_key')

  if (!apiKey) return null

  const rows = await sql`
    SELECT id, role, is_active FROM users
    WHERE api_key = ${apiKey} AND is_active = true
  `
  return rows[0] || null
}

export async function POST(request: NextRequest) {
  const user = await authenticateApiKey(request)
  if (!user) return error('Invalid or missing API key', 401)

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid email address', 422)

    const { email } = parsed.data

    // Check credits
    const credits = await sql`SELECT balance FROM user_credits WHERE user_id = ${user.id}`
    const balance = Number(credits[0]?.balance ?? 0)

    // Cache check is free
    const cached = await checkCacheFirst(email)
    if (cached) {
      return ok({
        email,
        status: cached.status,
        score: cached.score,
        mx_found: cached.mx_found,
        smtp_valid: cached.smtp_valid,
        is_disposable: cached.is_disposable,
        is_role_based: cached.is_role_based,
        is_catch_all: cached.is_catch_all,
        provider: cached.provider,
        from_cache: true,
      })
    }

    // Need credits to call mails.so
    if (balance < 1) return error('Insufficient credits. Top up at /dashboard/credits.', 402)

    // Deduct 1 credit
    await sql`
      UPDATE user_credits SET balance = balance - 1, updated_at = NOW()
      WHERE user_id = ${user.id} AND balance >= 1
    `

    const result = await verifyEmail(email)
    await storeInCache(result, user.id)

    // Log API usage
    await sql`
      INSERT INTO api_usage_logs (user_id, endpoint, credits_used)
      VALUES (${user.id}, '/api/v1/verify', 1)
    `

    return ok({
      email,
      status: result.status,
      score: result.score,
      mx_found: result.mx_found,
      smtp_valid: result.smtp_valid,
      is_disposable: result.is_disposable,
      is_role_based: result.is_role_based,
      is_catch_all: result.is_catch_all,
      provider: result.provider,
      from_cache: false,
    })
  } catch (e) {
    console.error('[v1/verify]', e)
    return error('Verification failed', 500)
  }
}

export async function GET(request: NextRequest) {
  const user = await authenticateApiKey(request)
  if (!user) return error('Invalid or missing API key', 401)

  const email = request.nextUrl.searchParams.get('email')
  if (!email) return error('email query parameter required', 400)

  // Re-use POST logic
  const fakeRequest = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ email }),
  })
  return POST(fakeRequest as NextRequest)
}
