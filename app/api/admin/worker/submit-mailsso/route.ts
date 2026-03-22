import { NextRequest } from 'next/server'
import { requireWorkerOrAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import { submitBatch, pollBatch, storeBatchInCache } from '@/lib/mailsso'
import sql from '@/lib/db'

export const maxDuration = 30

/**
 * Consumer endpoint used by the producer/consumer pipeline.
 * action=submit  → mark items as processing, send emails to mails.so, return batchId
 * action=poll    → check if mails.so batch is ready; if yes, write results and return stats
 */
export async function POST(req: NextRequest) {
  try { await requireWorkerOrAdmin() } catch { return forbidden() }
  try {
    const { jobId, action, batchId, items } = await req.json() as {
      jobId: string
      action: 'submit' | 'poll'
      batchId?: string
      items?: Array<{ id: string; email: string }>
    }

    // ── Submit: send a miss-batch to mails.so ───────────────────────────────
    if (action === 'submit') {
      if (!items || items.length === 0) return ok({ submitted: 0 })

      const newBatchId = await submitBatch(items.map(i => i.email))

      // Mark items as processing and store the mailsso batchId so poll can find them exactly
      const ids = items.map(i => i.id)
      await sql`
        UPDATE verification_job_items
        SET status = 'processing', mailsso_batch_id = ${newBatchId}
        WHERE id = ANY(${ids}::uuid[])
      `
      return ok({ batchId: newBatchId, submitted: items.length })
    }

    // ── Poll: check mails.so and write results if ready ─────────────────────
    if (action === 'poll') {
      if (!batchId) return ok({ ready: false, reason: 'no_batch_id' })

      const results = await pollBatch(batchId)
      if (!results) return ok({ ready: false })

      // Build result map
      const resultMap = new Map(results.map(r => [r.email.toLowerCase(), r.status]))

      // Fetch exactly the items that belong to THIS batch using mailsso_batch_id
      const processingItems = await sql`
        SELECT id, email FROM verification_job_items
        WHERE job_id = ${jobId} AND mailsso_batch_id = ${batchId}
      `

      // Write results in sub-chunks of 1k
      let written = 0
      const CHUNK = 1000
      for (let i = 0; i < processingItems.length; i += CHUNK) {
        const chunk = processingItems.slice(i, i + CHUNK)
        const ip = JSON.stringify(chunk.map((x: { id: string; email: string }) => ({
          id: x.id,
          result: resultMap.get((x.email as string).toLowerCase()) ?? 'unknown',
        })))
        await sql`
          UPDATE verification_job_items
          SET status = 'completed', result = v.result, from_cache = false, credits_charged = 1, processed_at = NOW()
          FROM json_to_recordset(${ip}::json) AS v(id uuid, result text)
          WHERE verification_job_items.id = v.id
        `
        const cp = JSON.stringify(chunk.map((x: { id: string; email: string }) => ({
          contact_id: x.id,
          status: resultMap.get((x.email as string).toLowerCase()) ?? 'unknown',
        })))
        await sql`
          UPDATE email_list_contacts SET verification_status = v.status, verified_at = NOW()
          FROM json_to_recordset(${cp}::json) AS v(contact_id uuid, status text)
          WHERE email_list_contacts.id = v.contact_id
        `
        written += chunk.length
      }

      // Store results in cache for future lookups
      try {
        const jobRow = await sql`SELECT user_id FROM verification_jobs WHERE id = ${jobId}`
        for (let i = 0; i < results.length; i += 2000) {
          await storeBatchInCache(results.slice(i, i + 2000) as Parameters<typeof storeBatchInCache>[0], jobRow[0]?.user_id as string)
        }
      } catch { /* non-critical */ }

      return ok({ ready: true, written, count: results.length })
    }

    return ok({ error: 'unknown action' })
  } catch (e) {
    return serverError(e)
  }
}
