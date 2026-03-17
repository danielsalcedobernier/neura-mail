import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, error } from '@/lib/api'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

/**
 * GET /api/verification/local/pending?job_id=xxx&limit=50000&offset=0
 * Returns the next chunk of pending items for local verification.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const jobId  = req.nextUrl.searchParams.get('job_id')
  const limit  = Math.min(Number(req.nextUrl.searchParams.get('limit')  ?? 50000), 50000)
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0)

  if (!jobId) return error('job_id required', 400)

  // Verify job belongs to user
  const jobs = await sql`
    SELECT id, total_emails FROM verification_jobs
    WHERE id = ${jobId} AND user_id = ${session.id}
  `
  if (jobs.length === 0) return unauthorized()

  const items = await sql`
    SELECT id, email FROM verification_job_items
    WHERE job_id = ${jobId} AND status = 'pending'
    ORDER BY id
    LIMIT ${limit} OFFSET ${offset}
  `

  const totalPending = await sql`
    SELECT COUNT(*) AS count FROM verification_job_items
    WHERE job_id = ${jobId} AND status = 'pending'
  `

  return ok({
    items,
    total_pending: Number(totalPending[0].count),
    total_emails: Number(jobs[0].total_emails),
  })
}
