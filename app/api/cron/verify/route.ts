export const maxDuration = 300

import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { checkCacheBulk, storeBatchInCache, submitBatch, pollBatch } from '@/lib/mailsso'
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
    // ── SEED PHASE: advance seeding jobs (50k rows per tick) ───────────────
    const seedingJobs = await sql`
      SELECT id, user_id, list_id, total_emails
      FROM verification_jobs
      WHERE status = 'seeding'
      ORDER BY created_at ASC
    `
    for (const sj of seedingJobs) {
      const SEED_CHUNK = 500000
      // Find the current seed offset (how many items already inserted)
      const countRes = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${sj.id}`
      const offset = Number(countRes[0].c)
      console.log(`[cron/verify] Seeding job=${sj.id} offset=${offset}`)

      const ids = await sql`
        SELECT id, email FROM email_list_contacts
        WHERE list_id = ${sj.list_id}
          AND (verification_status IS NULL OR verification_status = 'unverified')
          AND user_id = ${sj.user_id}
        ORDER BY id
        LIMIT ${SEED_CHUNK} OFFSET ${offset}
      `

      if (ids.length === 0) {
        // Seed complete
        const finalCount = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${sj.id}`
        const seeded = Number(finalCount[0].c)
        console.log(`[cron/verify] Seed complete job=${sj.id} total=${seeded}`)
        if (seeded === 0) {
          await failJob({ id: sj.id, user_id: sj.user_id, credits_reserved: sj.total_emails }, 'No emails found to verify')
        } else {
          await sql`
            UPDATE verification_jobs
            SET status = 'queued', total_emails = ${seeded}, next_run_at = NOW()
            WHERE id = ${sj.id}
          `
        }
      } else {
        await sql`
          INSERT INTO verification_job_items (job_id, contact_id, email)
          SELECT ${sj.id}, id, email
          FROM email_list_contacts
          WHERE id = ANY(${ids.map((r: { id: string }) => r.id)}::uuid[])
            AND (verification_status IS NULL OR verification_status = 'unverified')
          ON CONFLICT DO NOTHING
        `
        console.log(`[cron/verify] Seeded chunk job=${sj.id} inserted=${ids.length} total=${offset + ids.length}`)
      }
    }

    // Detect and fail jobs stuck in 'running' for more than 30 minutes
    const stuckJobs = await sql`
      SELECT id, user_id, credits_reserved FROM verification_jobs
      WHERE status = 'running'
        AND next_run_at < NOW() - INTERVAL '30 minutes'
    `
    if (stuckJobs.length > 0) {
      console.warn(`[cron/verify] Found ${stuckJobs.length} stuck job(s) — failing and refunding`)
      for (const stuck of stuckJobs) {
        await failJob(stuck, 'Job stuck: no progress for 30 minutes')
      }
    }

    // Pick ALL queued/running jobs that are due — process in parallel
    const jobs = await sql`
      SELECT vj.id, vj.user_id, vj.credits_reserved, vj.credits_used, vj.total_emails,
             vj.mailsso_batch_id, vj.mailsso_batch_submitted_at
      FROM verification_jobs vj
      WHERE vj.status IN ('queued', 'running')  -- never touch 'seeding' jobs
        AND vj.next_run_at <= NOW()
      ORDER BY vj.created_at ASC
    `

    if (jobs.length === 0) {
      console.log('[cron/verify] No jobs due — skipping')
      return { processed: 0, message: 'No jobs queued' }
    }

    console.log(`[cron/verify] Processing ${jobs.length} job(s): ${jobs.map((j: { id: string }) => j.id).join(', ')}`)

    // Mark all as running before starting parallel processing
    await sql`
      UPDATE verification_jobs SET status = 'running', started_at = COALESCE(started_at, NOW())
      WHERE id = ANY(${jobs.map((j: { id: string }) => j.id)}::uuid[])
    `

    const results = await Promise.all(jobs.map((job: typeof jobs[0]) => processJob(job)))
    console.log('[cron/verify] Tick results:', JSON.stringify(results))
    return { processed: jobs.length, results }
  })

  if (!result.ran) return ok({ skipped: true, reason: 'Already running' })
  if (result.error) {
    const isConfigError = result.error.includes('not configured') || result.error.includes('API key')
    if (isConfigError) return ok({ skipped: true, reason: result.error })
    return error(result.error, 500)
  }
  return ok(result.result)
}

async function processJob(job: { id: string; user_id: string; credits_reserved: number; credits_used: number; total_emails: number; mailsso_batch_id: string | null; mailsso_batch_submitted_at: string | null }) {
    console.log(`[cron/verify] processJob start: id=${job.id} total_emails=${job.total_emails} batch_id=${job.mailsso_batch_id ?? 'none'}`)

    // ── PHASE B: Poll existing batch job ────────────────────────────────────
    if (job.mailsso_batch_id) {
      const submittedAt = job.mailsso_batch_submitted_at ? new Date(job.mailsso_batch_submitted_at as string).getTime() : 0
      const waitedMs = Date.now() - submittedAt
      console.log(`[cron/verify] Phase B — polling batch_id=${job.mailsso_batch_id} waited=${Math.round(waitedMs/1000)}s`)

      if (submittedAt && waitedMs > 2 * 60 * 60 * 1000) {
        console.error(`[cron/verify] Batch timeout job=${job.id}`)
        return await failJob(job, 'Batch timeout: mails.so did not respond within 2 hours')
      }

      let results
      try {
        results = await pollBatch(job.mailsso_batch_id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[cron/verify] pollBatch error job=${job.id}:`, msg)
        const isPermanent = msg.includes('401') || msg.includes('403') || msg.includes('not found') || msg.includes('404')
        if (isPermanent) return await failJob(job, `mails.so poll error: ${msg}`)
        await sql`UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '60 seconds' WHERE id = ${job.id}`
        return { retrying: true, error: msg }
      }

      if (results === null) {
        console.log(`[cron/verify] Batch still processing — job=${job.id} will retry in 30s`)
        await sql`UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '30 seconds' WHERE id = ${job.id}`
        return { waiting: true, batchId: job.mailsso_batch_id }
      }
      console.log(`[cron/verify] Batch ready — job=${job.id} results=${results.length}`)

      // Results ready — save them all in bulk
      const resultMap = new Map(results.map(r => [r.email.toLowerCase(), r]))

      // Get the pending items for this batch
      const items = await sql`
        SELECT id, email FROM verification_job_items
        WHERE job_id = ${job.id} AND status = 'processing'
      `

      if (items.length > 0) {
        // Bulk update job items — 1 query using UNNEST
        const ids = items.map((i: { id: string }) => i.id)
        const matched = items
          .map((i: { id: string; email: string }) => ({
            id: i.id,
            r: resultMap.get(i.email.toLowerCase()),
          }))
          .filter(x => x.r)

        if (matched.length > 0) {
          await sql`
            UPDATE verification_job_items SET
              status = 'completed',
              result = v.result,
              from_cache = false,
              credits_charged = 1,
              processed_at = NOW()
            FROM (
              SELECT UNNEST(${matched.map(x => x.id)}::uuid[])   AS id,
                     UNNEST(${matched.map(x => x.r!.status)}::text[]) AS result
            ) AS v
            WHERE verification_job_items.id = v.id::uuid
          `
        }

        // Store all results in cache — 1 bulk INSERT
        await storeBatchInCache(results, job.user_id)

        // Bulk update contact statuses — 1 query
        const emails = results.map(r => r.email.toLowerCase())
        const statuses = results.map(r => r.status)
        await sql`
          UPDATE email_list_contacts SET
            verification_status = v.status::text,
            verified_at = NOW()
          FROM (
            SELECT UNNEST(${emails}::text[]) AS email,
                   UNNEST(${statuses}::text[]) AS status
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
    console.log(`[cron/verify] Phase A — job=${job.id} pending_items=${items.length}`)

    if (items.length === 0) {
      console.log(`[cron/verify] No pending items — finalizing job=${job.id}`)
      return await finalizeJob(job)
    }

    const cacheMap = await checkCacheBulk(items.map((i: { email: string }) => i.email))
    const cacheHits = items.filter((i: { email: string }) => cacheMap.has(i.email.toLowerCase()))
    const needsApi  = items.filter((i: { email: string }) => !cacheMap.has(i.email.toLowerCase()))
    console.log(`[cron/verify] Cache check — job=${job.id} hits=${cacheHits.length} needs_api=${needsApi.length}`)

    // Process cache hits — cache saves the API call but still costs 1 credit
    if (cacheHits.length > 0) {
      await sql`
        UPDATE verification_job_items SET
          status = 'completed',
          result = v.result,
          from_cache = true,
          credits_charged = 1,
          processed_at = NOW()
        FROM (
          SELECT UNNEST(${cacheHits.map((i: { id: string }) => i.id)}::uuid[])                                           AS id,
                 UNNEST(${cacheHits.map((i: { email: string }) => cacheMap.get(i.email.toLowerCase())!.status)}::text[]) AS result
        ) AS v
        WHERE verification_job_items.id = v.id::uuid
      `
      await sql`
        UPDATE email_list_contacts SET
          verification_status = v.status::text, verified_at = NOW()
        FROM (
          SELECT UNNEST(${cacheHits.map((i: { email: string }) => i.email.toLowerCase())}::text[])                         AS email,
                 UNNEST(${cacheHits.map((i: { email: string }) => cacheMap.get(i.email.toLowerCase())!.status)}::text[]) AS status
        ) AS v
        WHERE email_list_contacts.email = v.email
          AND email_list_contacts.user_id = ${job.user_id}
      `
    }

    // Submit non-cached emails to mails.so batch API
    if (needsApi.length > 0) {
      // Mark as processing
      try {
        await sql`
          UPDATE verification_job_items SET status = 'processing'
          WHERE id = ANY(${needsApi.map((i: { id: string }) => i.id)}::uuid[])
        `
        console.log(`[cron/verify] Marked ${needsApi.length} items as processing — job=${job.id}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[cron/verify] Failed to mark items as processing job=${job.id}:`, msg)
        await sql`UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '60 seconds' WHERE id = ${job.id}`
        return { retrying: true, error: `mark processing failed: ${msg}` }
      }

      console.log(`[cron/verify] Submitting ${needsApi.length} emails to mails.so — job=${job.id}`)
      let batchId: string
      try {
        batchId = await submitBatch(needsApi.map(i => i.email))
        console.log(`[cron/verify] Batch submitted — job=${job.id} batchId=${batchId}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[cron/verify] submitBatch error job=${job.id}:`, msg)
        const isPermanent = msg.includes('401') || msg.includes('403') || msg.includes('not configured')
        if (isPermanent) return await failJob(job, `mails.so submit error: ${msg}`)
        await sql`UPDATE verification_job_items SET status = 'pending' WHERE job_id = ${job.id} AND status = 'processing'`
        await sql`UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '60 seconds' WHERE id = ${job.id}`
        return { retrying: true, error: msg }
      }

      await sql`
        UPDATE verification_jobs SET
          mailsso_batch_id = ${batchId},
          mailsso_batch_submitted_at = NOW(),
          next_run_at = NOW() + INTERVAL '30 seconds'
        WHERE id = ${job.id}
      `

      return {
        cacheHits: cacheHits.length,
        submittedToBatch: needsApi.length,
        batchId,
      }
    }

    // All were cache hits — check if done
    return await finalizeOrContinue(job)
}

// Fail a job and refund ALL reserved credits that haven't been charged yet
async function failJob(job: { id: string; user_id: string; credits_reserved: number }, reason: string) {
  console.error(`[cron/verify] failJob: id=${job.id} reason="${reason}"`)
  const charged = await sql`
    SELECT COALESCE(SUM(credits_charged), 0) AS total
    FROM verification_job_items
    WHERE job_id = ${job.id} AND status = 'completed'
  `
  const refund = Number(job.credits_reserved) - Number(charged[0].total)

  await sql`
    UPDATE verification_jobs SET
      status = 'failed',
      completed_at = NOW(),
      error_message = ${reason}
    WHERE id = ${job.id}
  `

  if (refund > 0) {
    console.log(`[cron/verify] Refunding ${refund} credits to user=${job.user_id}`)
    await sql`
      UPDATE user_credits SET balance = balance + ${refund}, updated_at = NOW()
      WHERE user_id = ${job.user_id}
    `
  }

  return { jobFailed: job.id, reason, refund }
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

async function finalizeJob(job: { id: string; user_id: string; credits_reserved: number; total_emails?: number }) {
  console.log(`[cron/verify] finalizeJob: id=${job.id}`)
  const completedCount = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${job.id}`
  console.log(`[cron/verify] finalizeJob: completed_items=${completedCount[0].c} total_emails=${job.total_emails}`)
  if (Number(completedCount[0].c) === 0 && Number(job.total_emails ?? 0) > 0) {
    console.warn(`[cron/verify] finalizeJob skipped — no completed items yet for job=${job.id}`)
    await sql`UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '1 minute' WHERE id = ${job.id}`
    return { skipped: true, reason: 'No completed items yet — waiting for seed or processing' }
  }

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

  // Refund only emails that could not be verified at all (status unknown after trying)
  // Cache hits and API results both cost 1 credit — only unprocessed items get refunded
  const unprocessed = await sql`
    SELECT COUNT(*) AS count FROM verification_job_items
    WHERE job_id = ${job.id} AND status != 'completed'
  `
  const refund = Number(unprocessed[0].count)
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
