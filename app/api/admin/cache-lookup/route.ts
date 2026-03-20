import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, error, serverError } from '@/lib/api'
import sql from '@/lib/db'

const MAX_EMAILS = 50_000

/**
 * POST /api/admin/cache-lookup
 * Accepts { emails: string[] } (up to 50k per call).
 * Returns { found: string[] } — the subset already in global_email_cache.
 * Used by the browser to determine which emails need to go to mails.so.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()

  try {
    const body = await req.json()
    const { emails } = body as { emails: string[] }

    if (!Array.isArray(emails) || emails.length === 0) {
      return error('emails[] required', 400)
    }
    if (emails.length > MAX_EMAILS) {
      return error(`Max ${MAX_EMAILS} emails per lookup call`, 400)
    }

    const normalized = emails.map(e => e.toLowerCase().trim()).filter(e => e.includes('@'))

    // Use unnest for efficient bulk lookup — returns only the emails that exist in cache
    const rows = await sql`
      SELECT gec.email
      FROM unnest(${normalized}::text[]) AS input(email)
      INNER JOIN global_email_cache gec ON gec.email = input.email
      WHERE gec.expires_at > NOW()
    `

    const found = rows.map((r: { email: string }) => r.email)
    return ok({ found, total: normalized.length, cached: found.length })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
