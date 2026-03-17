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

    // mails.so signals completion via finished_at, not a status field
    const isDone    = !!data.finished_at
    const status    = isDone ? 'completed' : 'processing'
    const total     = data.total     ?? (data.emails?.length ?? 0)
    const processed = data.processed ?? (isDone ? total : 0)

    // Map each email result to the same status values used in verification_job_items
    // mails.so returns: result = deliverable|undeliverable|risky|unknown, reason = catch_all|disposable|...
    const rawEmails: Record<string, unknown>[] = data.emails ?? []
    const results = rawEmails.map(r => {
      const isCatchAll = r.reason === 'catch_all' || r.isv_nocatchall === false
      let mappedStatus = 'unknown'
      if (isCatchAll)                      mappedStatus = 'catch_all'
      else if (r.result === 'deliverable') mappedStatus = 'valid'
      else if (r.result === 'undeliverable') mappedStatus = 'invalid'
      else if (r.result === 'risky')       mappedStatus = 'risky'
      return { email: r.email, status: mappedStatus }
    })

    return ok({ status, total, processed, results })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
