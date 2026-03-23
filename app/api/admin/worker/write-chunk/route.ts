import { NextRequest } from 'next/server'
import { requireWorkerOrAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import { storeBatchInCache } from '@/lib/mailsso'
import sql from '@/lib/db'

export const maxDuration = 300

const WRITE_CHUNK = 1000

export async function POST(req: NextRequest) {
  try { await requireWorkerOrAdmin() } catch { return forbidden() }
  try {
    const { jobId, offset, limit = 5000 } = await req.json() as { jobId: string; offset: number; limit?: number }

    // Fetch the stored batch results from verification_jobs
    const jobRow = await sql`
      SELECT mailsso_batch_result, mailsso_batch_id, user_id
      FROM verification_jobs WHERE id = ${jobId}
    `
    if (!jobRow[0]) return ok({ error: 'job not found', written: 0, done: false })

    const results = (jobRow[0].mailsso_batch_result ?? []) as Array<{ email: string; status: string }>
    const resultMap = new Map(results.map(r => [r.email.toLowerCase(), r.status]))

    // Fetch next chunk of processing items (items sent to mails.so)
    const items = await sql`
      SELECT id, email FROM verification_job_items
      WHERE job_id = ${jobId} AND status = 'processing'
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `

    if (items.length === 0) {
      // Check if there are still pending/processing items
      const pending = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${jobId} AND status = 'pending'`
      const processing = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${jobId} AND status = 'processing'`
      const isDone = Number(pending[0].c) === 0 && Number(processing[0].c) === 0

      if (isDone) {
        // Finalize the job — works whether results came from cache or mails.so
        await finalizeJob(jobId, jobRow[0].user_id as string)
        if (results.length > 0) {
          try {
            for (let i = 0; i < results.length; i += 2000) {
              await storeBatchInCache(results.slice(i, i + 2000) as Parameters<typeof storeBatchInCache>[0], jobRow[0].user_id as string)
            }
          } catch { /* non-critical */ }
          await sql`UPDATE verification_jobs SET mailsso_batch_result = NULL WHERE id = ${jobId}`
        }
      }

      return ok({ written: 0, done: isDone, batchDone: isDone })
    }

    // Write results in sub-chunks
    let written = 0
    for (let i = 0; i < items.length; i += WRITE_CHUNK) {
      const chunk = items.slice(i, i + WRITE_CHUNK)
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

    // Check if all processing items in this batch are done
    const remaining = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${jobId} AND status = 'processing'`
    const batchDone = Number(remaining[0].c) === 0

    return ok({ written, done: false, batchDone, nextOffset: offset + limit })
  } catch (e) {
    return serverError(e)
  }
}

async function finalizeJob(jobId: string, userId: string) {
  const listRow = await sql`SELECT list_id FROM verification_jobs WHERE id = ${jobId}`
  const listId = listRow[0]?.list_id

  // Try counting from verification_job_items first (mails.so flow)
  const itemCount = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${jobId}`
  const hasItems = Number(itemCount[0].c) > 0

  let valid = 0, invalid = 0, risky = 0, unknown = 0, catch_all = 0, cache_hits = 0, credits_used = 0

  if (hasItems) {
    // Normal mails.so flow — count from job items
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE result = 'valid')     AS valid,
        COUNT(*) FILTER (WHERE result = 'invalid')   AS invalid,
        COUNT(*) FILTER (WHERE result = 'risky')     AS risky,
        COUNT(*) FILTER (WHERE result = 'unknown')   AS unknown,
        COUNT(*) FILTER (WHERE result = 'catch_all') AS catch_all,
        COUNT(*) FILTER (WHERE from_cache = true)    AS cache_hits,
        COALESCE(SUM(credits_charged), 0)            AS credits_used
      FROM verification_job_items WHERE job_id = ${jobId}
    `
    const s = stats[0]
    valid       = Number(s.valid)
    invalid     = Number(s.invalid)
    risky       = Number(s.risky)
    unknown     = Number(s.unknown)
    catch_all   = Number(s.catch_all)
    cache_hits  = Number(s.cache_hits)
    credits_used = Number(s.credits_used)
  } else if (listId) {
    // All-cache flow — count directly from email_list_contacts (already updated by poll/submit)
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE verification_status = 'valid')     AS valid,
        COUNT(*) FILTER (WHERE verification_status = 'invalid')   AS invalid,
        COUNT(*) FILTER (WHERE verification_status = 'risky')     AS risky,
        COUNT(*) FILTER (WHERE verification_status = 'unknown')   AS unknown,
        COUNT(*) FILTER (WHERE verification_status = 'catch_all') AS catch_all,
        COUNT(*)                                                   AS total
      FROM email_list_contacts WHERE list_id = ${listId}
        AND verification_status IS NOT NULL
        AND verification_status != 'unverified'
    `
    const s = stats[0]
    valid      = Number(s.valid)
    invalid    = Number(s.invalid)
    risky      = Number(s.risky)
    unknown    = Number(s.unknown)
    catch_all  = Number(s.catch_all)
    cache_hits = Number(s.total) // all from cache
    credits_used = 0             // cache hits are free
  }

  await sql`
    UPDATE verification_jobs SET
      status = 'completed', completed_at = NOW(),
      valid_count     = ${valid},
      invalid_count   = ${invalid},
      risky_count     = ${risky},
      unknown_count   = ${unknown},
      catch_all_count = ${catch_all},
      cache_hit_count = ${cache_hits},
      credits_used    = ${credits_used}
    WHERE id = ${jobId}
  `

  if (listId) {
    await sql`
      UPDATE email_lists SET
        valid_count      = (SELECT COUNT(*) FILTER (WHERE verification_status IN ('valid','catch_all')) FROM email_list_contacts WHERE list_id = ${listId}),
        invalid_count    = (SELECT COUNT(*) FILTER (WHERE verification_status = 'invalid') FROM email_list_contacts WHERE list_id = ${listId}),
        unverified_count = (SELECT COUNT(*) FILTER (WHERE verification_status IN ('unverified','unknown') OR verification_status IS NULL) FROM email_list_contacts WHERE list_id = ${listId}),
        verified_at      = NOW()
      WHERE id = ${listId}
    `
  }

  // Refund unused credits (only relevant for mails.so flow)
  if (hasItems) {
    const unprocessed = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${jobId} AND status != 'completed'`
    const refund = Number(unprocessed[0].c)
    if (refund > 0) await sql`UPDATE user_credits SET balance = balance + ${refund}, updated_at = NOW() WHERE user_id = ${userId}`
  }
}
