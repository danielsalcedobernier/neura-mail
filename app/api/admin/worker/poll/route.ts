import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import { pollBatch, submitBatch, checkCacheBulk } from '@/lib/mailsso'
import sql from '@/lib/db'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }
  try {
    const { jobId, action } = await req.json() as { jobId: string; action: 'poll' | 'submit' | 'cache-check' }

    if (action === 'poll') {
      // Poll mails.so for results on an existing batch
      const job = await sql`SELECT mailsso_batch_id FROM verification_jobs WHERE id = ${jobId}`
      if (!job[0]?.mailsso_batch_id) return ok({ ready: false, reason: 'no_batch' })

      const results = await pollBatch(job[0].mailsso_batch_id as string)
      if (!results) return ok({ ready: false })

      // Store results temporarily so write-chunk can pick them up
      await sql`
        UPDATE verification_jobs
        SET mailsso_batch_result = ${JSON.stringify(results)}::jsonb,
            mailsso_result_fetched_at = NOW()
        WHERE id = ${jobId}
      `
      return ok({ ready: true, count: results.length })
    }

    if (action === 'submit') {
      // Fetch a batch of pending items and submit to mails.so
      const CHUNK = 10000
      const items = await sql`
        SELECT id, email FROM verification_job_items
        WHERE job_id = ${jobId} AND status = 'pending'
        ORDER BY id LIMIT ${CHUNK}
      `
      if (items.length === 0) return ok({ submitted: 0, done: true })

      // Check cache first
      const emailList = items.map((i: { email: string }) => i.email as string)
      const cacheMap  = await checkCacheBulk(emailList)

      const hits    = items.filter((i: { email: string }) => cacheMap.has((i.email as string).toLowerCase()))
      const misses  = items.filter((i: { email: string }) => !cacheMap.has((i.email as string).toLowerCase()))

      // Write cache hits immediately
      if (hits.length > 0) {
        const payload = JSON.stringify(hits.map((h: { id: string; email: string }) => ({
          id: h.id,
          result: cacheMap.get((h.email as string).toLowerCase())!.status,
        })))
        await sql`
          UPDATE verification_job_items
          SET status = 'completed', result = v.result, from_cache = true, credits_charged = 1, processed_at = NOW()
          FROM json_to_recordset(${payload}::json) AS v(id uuid, result text)
          WHERE verification_job_items.id = v.id
        `
        const cpPayload = JSON.stringify(hits.map((h: { id: string; email: string }) => ({
          contact_id: h.id,
          status: cacheMap.get((h.email as string).toLowerCase())!.status,
        })))
        await sql`
          UPDATE email_list_contacts SET verification_status = v.status, verified_at = NOW()
          FROM json_to_recordset(${cpPayload}::json) AS v(contact_id uuid, status text)
          WHERE email_list_contacts.id = v.contact_id
        `
      }

      if (misses.length === 0) {
        return ok({ submitted: 0, cacheHits: hits.length, done: false })
      }

      // Mark misses as processing and submit
      const missIds = misses.map((m: { id: string }) => m.id as string)
      await sql`UPDATE verification_job_items SET status = 'processing' WHERE id = ANY(${missIds}::uuid[])`

      const batchId = await submitBatch(misses.map((m: { email: string }) => m.email as string))
      await sql`
        UPDATE verification_jobs
        SET mailsso_batch_id = ${batchId},
            mailsso_batch_submitted_at = NOW(),
            mailsso_batch_result = NULL,
            status = 'running'
        WHERE id = ${jobId}
      `
      return ok({ submitted: misses.length, cacheHits: hits.length, batchId })
    }

    return ok({ error: 'unknown action' })
  } catch (e) {
    return serverError(e)
  }
}
