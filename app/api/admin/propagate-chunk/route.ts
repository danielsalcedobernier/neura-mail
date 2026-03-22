import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }

  const { searchParams } = new URL(req.url)
  const jobId  = searchParams.get('jobId')
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const limit  = parseInt(searchParams.get('limit')  ?? '5000', 10)

  if (!jobId) return ok({ rowsUpdated: 0, done: true, error: 'Missing jobId' })

  try {
    const result = await sql`
      WITH batch AS (
        SELECT contact_id, result
        FROM verification_job_items
        WHERE job_id = ${jobId}
          AND status = 'completed'
          AND result IS NOT NULL
          AND contact_id IS NOT NULL
        ORDER BY contact_id
        LIMIT ${limit} OFFSET ${offset}
      )
      UPDATE email_list_contacts elc
      SET verification_status = batch.result,
          verified_at = NOW()
      FROM batch
      WHERE elc.id = batch.contact_id
        AND elc.verification_status IN ('unverified', 'unknown')
      RETURNING elc.id
    `

    const rowsUpdated = result.length
    const done = rowsUpdated === 0

    // If done, re-sync counters for this job's list
    if (done) {
      const jobs = await sql`SELECT list_id FROM verification_jobs WHERE id = ${jobId} LIMIT 1`
      if (jobs[0]) {
        const listId = jobs[0].list_id
        await sql`
          UPDATE email_lists el
          SET
            valid_count      = counts.valid_count,
            invalid_count    = counts.invalid_count,
            unverified_count = counts.unverified_count,
            verified_at      = NOW()
          FROM (
            SELECT
              COUNT(*) FILTER (WHERE verification_status IN ('valid', 'catch_all')) AS valid_count,
              COUNT(*) FILTER (WHERE verification_status = 'invalid')               AS invalid_count,
              COUNT(*) FILTER (WHERE verification_status IN ('unverified','unknown') OR verification_status IS NULL) AS unverified_count
            FROM email_list_contacts
            WHERE list_id = ${listId}
          ) counts
          WHERE el.id = ${listId}
        `
      }
    }

    return ok({ rowsUpdated, done, offset, limit })
  } catch (e: unknown) {
    return serverError(e instanceof Error ? e.message : 'Unknown error')
  }
}
