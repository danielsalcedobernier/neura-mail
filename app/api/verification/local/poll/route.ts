import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, serverError } from '@/lib/api'
import sql from '@/lib/db'

/**
 * GET /api/verification/local/poll?batch_id=xxx
 * Proxy a single poll to mails.so using the same API key/URL stored in api_connections.
 * Returns { status, total, processed, results[] } — browser polls every 10s until completed.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const batchId = req.nextUrl.searchParams.get('batch_id')
    if (!batchId) return unauthorized()

    // Load mails.so config from DB — same source as the cron
    const rows = await sql`
      SELECT credentials, extra_config FROM api_connections
      WHERE service_name = 'mails_so' AND is_active = true
    `
    if (!rows[0]) return serverError('mails.so not configured')
    const creds  = rows[0].credentials as Record<string, string>
    const config = rows[0].extra_config as Record<string, string>
    const apiKey  = creds.api_key
    const baseUrl = config.base_url || 'https://api.mails.so/v1'

    const res = await fetch(`${baseUrl}/batch/${batchId}`, {
      headers: { 'x-mails-api-key': apiKey },
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const err = await res.text()
      return serverError(`mails.so poll error: ${err}`)
    }

    const body = await res.json()
    const data  = body.data ?? body

    const status    = data.status    ?? 'processing'
    const total     = data.total     ?? 0
    const processed = data.processed ?? 0
    const results   = data.emails    ?? data.results ?? []

    return ok({ status, total, processed, results })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
