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
        AND status IN ('queued', 'running', 'seeding')
      RETURNING id, status
    `
    if (!rows[0]) return notFound('Verification job')
    console.log(`[verification PATCH] Paused job=${id}`)
    return ok({ paused: true, id })
  }

  if (action === 'resume') {
    const rows = await sql`
      UPDATE verification_jobs SET status = 'queued', next_run_at = NOW()
      WHERE id = ${id} AND user_id = ${session.id}
        AND status = 'paused'
      RETURNING id, status
    `
    if (!rows[0]) return notFound('Verification job')
    console.log(`[verification PATCH] Resumed job=${id}`)
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
      AND status IN ('queued', 'running', 'paused')
    RETURNING id, credits_reserved, credits_used
  `
  if (!rows[0]) return notFound('Verification job')

  // Refund unused credits
  const refund = (rows[0].credits_reserved || 0) - (rows[0].credits_used || 0)
  if (refund > 0) {
    await sql`
      UPDATE user_credits SET balance = balance + ${refund}, updated_at = NOW()
      WHERE user_id = ${session.id}
    `
  }
  return ok({ cancelled: true, creditsRefunded: refund })
}
