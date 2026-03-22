import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import sql from '@/lib/db'

export const maxDuration = 300 // 5 min — admin-only, long running

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }

  try {
    const { listId, jobId } = await req.json()

    // Step 1: Propagate verification_job_items → email_list_contacts in one query
    // Uses the idx_vji_contact_id index — filtered by job to avoid full scan
    const updateResult = await sql`
      UPDATE email_list_contacts elc
      SET verification_status = vji.result,
          verified_at         = NOW()
      FROM verification_job_items vji
      WHERE vji.contact_id = elc.id
        AND vji.job_id     = ${jobId}
        AND vji.status     = 'completed'
        AND vji.result     IS NOT NULL
        AND elc.verification_status IN ('unverified', 'unknown')
    `

    // Step 2: Resync counters for this list only
    const counters = await sql`
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
          COUNT(*) FILTER (WHERE verification_status IN ('unverified', 'unknown') OR verification_status IS NULL) AS unverified_count
        FROM email_list_contacts
        WHERE list_id = ${listId}
      ) counts
      WHERE el.id = ${listId}
      RETURNING el.name, el.valid_count, el.invalid_count, el.unverified_count
    `

    return ok({
      updated: updateResult.length,
      list: counters[0] ?? null,
    })
  } catch (e) {
    return serverError(e)
  }
}
