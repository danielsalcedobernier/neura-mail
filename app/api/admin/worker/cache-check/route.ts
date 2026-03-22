import { NextRequest } from 'next/server'
import { requireWorkerOrAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import { checkCacheBulk } from '@/lib/mailsso'
import sql from '@/lib/db'

export const maxDuration = 30

/**
 * Producer endpoint: fetches a batch of pending items, checks cache,
 * writes hits immediately, returns misses for the consumer queue.
 */
export async function POST(req: NextRequest) {
  try { await requireWorkerOrAdmin() } catch { return forbidden() }
  try {
    const { jobId, batchSize = 1000 } = await req.json() as { jobId: string; batchSize?: number }

    // Fetch next pending batch
    const items = await sql`
      SELECT id, email FROM verification_job_items
      WHERE job_id = ${jobId} AND status = 'pending'
      ORDER BY id
      LIMIT ${batchSize}
    `

    if (items.length === 0) {
      // No more pending — check if anything is still processing (in flight to mails.so)
      const inFlight = await sql`
        SELECT COUNT(*) AS c FROM verification_job_items
        WHERE job_id = ${jobId} AND status = 'processing'
      `
      return ok({ done: true, cacheHits: 0, misses: [], inFlight: Number(inFlight[0].c) })
    }

    const emails = items.map((i: { email: string }) => i.email as string)
    const cacheMap = await checkCacheBulk(emails)

    const hits   = items.filter((i: { email: string }) => cacheMap.has((i.email as string).toLowerCase()))
    const misses = items.filter((i: { email: string }) => !cacheMap.has((i.email as string).toLowerCase()))

    // Write cache hits immediately to job_items + email_list_contacts
    if (hits.length > 0) {
      const itemsPayload = JSON.stringify(hits.map((h: { id: string; email: string }) => ({
        id: h.id,
        result: cacheMap.get((h.email as string).toLowerCase())!.status,
      })))
      await sql`
        UPDATE verification_job_items
        SET status = 'completed', result = v.result, from_cache = true, credits_charged = 1, processed_at = NOW()
        FROM json_to_recordset(${itemsPayload}::json) AS v(id uuid, result text)
        WHERE verification_job_items.id = v.id
      `
      const contactsPayload = JSON.stringify(hits.map((h: { id: string; email: string }) => ({
        contact_id: h.id,
        status: cacheMap.get((h.email as string).toLowerCase())!.status,
      })))
      await sql`
        UPDATE email_list_contacts SET verification_status = v.status, verified_at = NOW()
        FROM json_to_recordset(${contactsPayload}::json) AS v(contact_id uuid, status text)
        WHERE email_list_contacts.id = v.contact_id
      `
    }

    // Mark misses as 'queued_for_mailsso' so next cache-check batch skips them
    if (misses.length > 0) {
      const missIds = misses.map((m: { id: string }) => m.id as string)
      await sql`
        UPDATE verification_job_items SET status = 'queued_for_mailsso'
        WHERE id = ANY(${missIds}::uuid[])
      `
    }

    return ok({
      done: false,
      cacheHits: hits.length,
      misses: misses.map((m: { id: string; email: string }) => ({ id: m.id, email: m.email })),
      remaining: items.length === batchSize, // there may be more pending
    })
  } catch (e) {
    return serverError(e)
  }
}
