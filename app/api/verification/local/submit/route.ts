import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, badRequest, serverError } from '@/lib/api'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

const MAILSSO_API_KEY = process.env.MAILSSO_API_KEY!
const MAILSSO_BASE    = 'https://api.mails.so/v1'

/**
 * POST /api/verification/local/submit
 * Receives a chunk of emails (up to 50k), submits to mails.so, returns batch_id.
 * Called from the browser — runs in the user's local session.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await req.json()
    const { job_id, emails } = body as { job_id: string; emails: { id: string; email: string }[] }

    if (!job_id || !Array.isArray(emails) || emails.length === 0) {
      return badRequest('job_id and emails[] required')
    }
    if (emails.length > 50000) {
      return badRequest('Max 50,000 emails per chunk')
    }

    // Verify job belongs to user
    const jobs = await sql`
      SELECT id FROM verification_jobs WHERE id = ${job_id} AND user_id = ${session.id}
    `
    if (jobs.length === 0) return unauthorized()

    // Submit to mails.so
    const res = await fetch(`${MAILSSO_BASE}/emails/verify/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mails-api-key': MAILSSO_API_KEY,
      },
      body: JSON.stringify({ emails: emails.map(e => e.email) }),
    })

    if (!res.ok) {
      const err = await res.text()
      return serverError(`mails.so error: ${err}`)
    }

    const data = await res.json()
    const batchId: string = data.data?.id ?? data.id

    return ok({ batch_id: batchId, count: emails.length })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
