import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, error, serverError } from '@/lib/api'
import sql from '@/lib/db'
import { submitBatch } from '@/lib/mailsso'

/**
 * POST /api/verification/local/submit
 * Receives a chunk of emails (up to 50k), submits to mails.so via submitBatch, returns batch_id.
 * Called from the browser — runs in the user's local session.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await req.json()
    const { job_id, emails } = body as { job_id: string; emails: { id: string; email: string }[] }

    if (!job_id || !Array.isArray(emails) || emails.length === 0) {
      return error('job_id and emails[] required', 400)
    }
    if (emails.length > 50000) {
      return error('Max 50,000 emails per chunk', 400)
    }

    // Verify job belongs to user
    const jobs = await sql`
      SELECT id FROM verification_jobs WHERE id = ${job_id} AND user_id = ${session.id}
    `
    if (jobs.length === 0) return unauthorized()

    // Use the same submitBatch used by the cron — reads API key and URL from api_connections table
    const batchId = await submitBatch(emails.map(e => e.email))

    return ok({ batch_id: batchId, count: emails.length })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
