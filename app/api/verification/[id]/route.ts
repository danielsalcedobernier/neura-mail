import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const jobs = await sql`
    SELECT vj.*, el.name as list_name
    FROM verification_jobs vj
    LEFT JOIN email_lists el ON el.id = vj.list_id
    WHERE vj.id = ${id} AND vj.user_id = ${session.id}
  `
  if (!jobs[0]) return notFound('Verification job')
  return ok(jobs[0])
}

// Pause or resume a job
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params
  const body = await request.json()
  const action = body.action as 'pause' | 'resume'

  if (action === 'pause') {
    const rows = await sql`
      UPDATE verification_jobs SET status = 'paused'
      WHERE id = ${id} AND user_id = ${session.id}
        AND status IN ('queued', 'running', 'seeding', 'cache_sweeping')
      RETURNING id, status
    `
    if (!rows[0]) return notFound('Verification job')
    return ok({ paused: true, id })
  }

  if (action === 'resume') {
    // Allow resuming paused OR failed jobs
    // Clear mailsso_batch_id so the cron doesn't try to poll an expired/failed batch
    const rows = await sql`
      UPDATE verification_jobs
      SET status = 'queued',
          next_run_at = NOW(),
          mailsso_batch_id = NULL,
          mailsso_batch_submitted_at = NULL
      WHERE id = ${id} AND user_id = ${session.id}
        AND status IN ('paused', 'failed')
      RETURNING id, status
    `
    if (!rows[0]) return notFound('Verification job')

    // Reset any stuck 'processing' items back to 'pending' so they get picked up again
    await sql`
      UPDATE verification_job_items SET status = 'pending'
      WHERE job_id = ${id} AND status = 'processing'
    `

    return ok({ resumed: true, id })
  }

  return error('Invalid action. Use pause or resume.', 400)
}

// Cancel a running job
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`
    UPDATE verification_jobs
    SET status = 'cancelled'
    WHERE id = ${id} AND user_id = ${session.id}
      AND status IN ('queued', 'seeding', 'cache_sweeping', 'running', 'paused', 'failed')
    RETURNING id, credits_reserved, processed_count
  `
  if (!rows[0]) return notFound('Verification job')

  const job = rows[0]
  const creditsReserved = Number(job.credits_reserved ?? 0)
  const processedCount  = Number(job.processed_count ?? 0)

  // Refund = credits reserved minus what was already processed
  // This handles the seeding phase correctly: even if job_items don't exist yet,
  // credits_reserved reflects the full amount charged upfront
  const refund = Math.max(0, creditsReserved - processedCount)

  if (refund > 0) {
    await sql`
      UPDATE user_credits SET balance = balance + ${refund}, updated_at = NOW()
      WHERE user_id = ${session.id}
    `
  }

  // Mark any seeded items as cancelled so counts stay accurate
  await sql`
    UPDATE verification_job_items SET status = 'cancelled'
    WHERE job_id = ${id} AND status IN ('pending', 'processing')
  `

  return ok({ cancelled: true, creditsRefunded: refund })
}
