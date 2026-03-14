import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { checkCacheFirst, storeInCache, submitBatch, pollBatch } from '@/lib/mailsso'
import { ok, error } from '@/lib/api'

const BATCH_SIZE = 50000 // mails.so supports up to 50k per batch

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  const result = await withCronLock('process_verification_queue', async () => {
    // Pick one running or queued job
    const jobs = await sql`
      SELECT vj.id, vj.user_id, vj.credits_reserved, vj.credits_used,
             vj.mailsso_batch_id, vj.mailsso_batch_submitted_at
      FROM verification_jobs vj
      WHERE vj.status IN ('queued', 'running')
        AND vj.next_run_at <= NOW()
      ORDER BY vj.created_at ASC
      LIMIT 1
    `
    if (!jobs[0]) return { processed: 0, message: 'No jobs queued' }
    const job = jobs[0]

    await sql`
      UPDATE verification_jobs SET status = 'running', started_at = COALESCE(started_at, NOW())
      WHERE id = ${job.id}
    `

    // ── PHASE B: Poll existing batch job ────────────────────────────────────
    if (job.mailsso_batch_id) {
      const results = await pollBatch(job.mailsso_batch_id)

      // Still processing on mails.so side — come back next cron tick
      if (results === null) {
        await sql`UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '30 seconds' WHERE id = ${job.id}`
        return { waiting: true, batchId: job.mailsso_batch_id }
      }

      // Results ready — save them all in bulk
      const resultMap = new Map(results.map(r => [r.email.toLowerCase(), r]))

      // Get the pending items for this batch
      const items = await sql`
        SELECT id, email FROM verification_job_items
        WHERE job_id = ${job.id} AND status = 'processing'
      `

      if (items.length > 0) {
        // Bulk update job items
        for (const item of items) {
          const r = resultMap.get(item.email.toLowerCase())
          if (!r) continue
          await sql`
            UPDATE verification_job_items SET
              status = 'completed', result = ${r.status},
              from_cache = false, credits_charged = 1,
              processed_at = NOW()
            WHERE id = ${item.id}
          `
        }

        // Bulk update contact verification statuses in one query
        const emailResults = results.map(r => ({ email: r.email.toLowerCase(), status: r.status, score: r.score }))
        for (const r of emailResults) {
          await storeInCache(r as Parameters<typeof storeInCache>[0], job.user_id)
        }

        await sql`
          UPDATE email_list_contacts SET
            verification_status = v.status::text,
            verified_at = NOW()
          FROM (
            SELECT UNNEST(${emailResults.map(r => r.email)}::text[]) AS email,
                   UNNEST(${emailResults.map(r => r.status)}::text[]) AS status
          ) AS v
          WHERE email_list_contacts.email = v.email
            AND email_list_contacts.user_id = ${job.user_id}
        `
      }

      // Clear the batch id and check if more pending items exist
      await sql`
        UPDATE verification_jobs SET mailsso_batch_id = NULL, mailsso_batch_submitted_at = NULL
        WHERE id = ${job.id}
      `
      return await finalizeOrContinue(job)
    }

    // ── PHASE A: Pick pending items, check cache, submit new batch ───────────
    const items = await sql`
      SELECT id, email FROM verification_job_items
      WHERE job_id = ${job.id} AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT ${BATCH_SIZE}
    `

    if (items.length === 0) return await finalizeJob(job)

    // Split into cached vs needs API call
    const cacheResults: { id: string; email: string; result: Awaited<ReturnType<typeof checkCacheFirst>> }[] = []
    const needsApi: { id: string; email: string }[] = []

    await Promise.all(items.map(async (item: { id: string; email: string }) => {
      const cached = await checkCacheFirst(item.email)
      if (cached) cacheResults.push({ id: item.id, email: item.email, result: cached })
      else needsApi.push(item)
    }))

    // Process cache hits immediately (no API cost)
    if (cacheResults.length > 0) {
      for (const c of cacheResults) {
        await sql`
          UPDATE verification_job_items SET
            status = 'completed', result = ${c.result!.status},
            from_cache = true, credits_charged = 0, processed_at = NOW()
          WHERE id = ${c.id}
        `
      }
      await sql`
        UPDATE email_list_contacts SET
          verification_status = v.status::text, verified_at = NOW()
        FROM (
          SELECT UNNEST(${cacheResults.map(c => c.email)}::text[]) AS email,
                 UNNEST(${cacheResults.map(c => c.result!.status)}::text[]) AS status
        ) AS v
        WHERE email_list_contacts.email = v.email
          AND email_list_contacts.user_id = ${job.user_id}
      `
    }

    // Submit non-cached emails to mails.so batch API
    if (needsApi.length > 0) {
      // Mark as processing
      await sql`
        UPDATE verification_job_items SET status = 'processing'
        WHERE id = ANY(${needsApi.map(i => i.id)}::uuid[])
      `

      const batchId = await submitBatch(needsApi.map(i => i.email))

      // Store batchId — next cron tick will poll for results
      await sql`
        UPDATE verification_jobs SET
          mailsso_batch_id = ${batchId},
          mailsso_batch_submitted_at = NOW(),
          next_run_at = NOW() + INTERVAL '30 seconds'
        WHERE id = ${job.id}
      `

      return {
        cacheHits: cacheResults.length,
        submittedToBatch: needsApi.length,
        batchId,
      }
    }

    // All were cache hits — check if done
    return await finalizeOrContinue(job)
  })

  if (!result.ran) return ok({ skipped: true, reason: 'Already running' })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}

// Check if job has more pending items or is complete
async function finalizeOrContinue(job: { id: string; user_id: string; credits_reserved: number }) {
  const remaining = await sql`
    SELECT COUNT(*) as count FROM verification_job_items
    WHERE job_id = ${job.id} AND status = 'pending'
  `
  if (Number(remaining[0].count) > 0) {
    await sql`UPDATE verification_jobs SET next_run_at = NOW() WHERE id = ${job.id}`
    return { continued: true, remaining: remaining[0].count }
  }
  return await finalizeJob(job)
}

async function finalizeJob(job: { id: string; user_id: string; credits_reserved: number }) {
  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE result = 'valid')     AS valid,
      COUNT(*) FILTER (WHERE result = 'invalid')   AS invalid,
      COUNT(*) FILTER (WHERE result = 'risky')     AS risky,
      COUNT(*) FILTER (WHERE result = 'unknown')   AS unknown,
      COUNT(*) FILTER (WHERE result = 'catch_all') AS catch_all,
      COUNT(*) FILTER (WHERE from_cache = true)    AS cache_hits,
      COALESCE(SUM(credits_charged), 0)            AS credits_used
    FROM verification_job_items
    WHERE job_id = ${job.id}
  `
  const s = stats[0]

  await sql`
    UPDATE verification_jobs SET
      status = 'completed', completed_at = NOW(),
      valid_count = ${s.valid}, invalid_count = ${s.invalid},
      risky_count = ${s.risky}, unknown_count = ${s.unknown},
      catch_all_count = ${s.catch_all}, cache_hit_count = ${s.cache_hits},
      credits_used = ${s.credits_used}
    WHERE id = ${job.id}
  `

  // Refund unused reserved credits
  const refund = Number(job.credits_reserved) - Number(s.credits_used)
  if (refund > 0) {
    await sql`
      UPDATE user_credits SET balance = balance + ${refund}, updated_at = NOW()
      WHERE user_id = ${job.user_id}
    `
  }

  // Update list counts
  await sql`
    UPDATE email_lists SET
      valid_count     = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = email_lists.id AND verification_status = 'valid'),
      invalid_count   = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = email_lists.id AND verification_status = 'invalid'),
      unverified_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = email_lists.id AND verification_status IS NULL)
    WHERE id = (SELECT list_id FROM verification_jobs WHERE id = ${job.id})
  `

  return { jobCompleted: job.id, ...s }
}
