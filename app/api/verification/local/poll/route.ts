import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, serverError } from '@/lib/api'

const MAILSSO_API_KEY = process.env.MAILSSO_API_KEY!
const MAILSSO_BASE    = 'https://api.mails.so/v1'

/**
 * GET /api/verification/local/poll?batch_id=xxx
 * Proxy a single poll to mails.so and return the status + results if ready.
 * The browser calls this every 10s until status === 'completed'.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const batchId = req.nextUrl.searchParams.get('batch_id')
    if (!batchId) return unauthorized()

    const res = await fetch(`${MAILSSO_BASE}/emails/verify/bulk/${batchId}`, {
      headers: { 'x-mails-api-key': MAILSSO_API_KEY },
      // 30s timeout per single poll — browser retries every 10s so this is safe
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const err = await res.text()
      return serverError(`mails.so poll error: ${err}`)
    }

    const data = await res.json()
    // Normalise response: { status, total, processed, results[] }
    const status    = data.data?.status  ?? data.status
    const total     = data.data?.total   ?? data.total   ?? 0
    const processed = data.data?.processed ?? data.processed ?? 0
    const results   = data.data?.emails  ?? data.results ?? data.emails ?? []

    return ok({ status, total, processed, results })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
