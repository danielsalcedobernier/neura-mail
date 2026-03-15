export const maxDuration = 55

import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { checkCacheBulk, storeBatchInCache, submitBatch, pollBatch } from '@/lib/mailsso'
import { ok, error } from '@/lib/api'

const BATCH_SIZE = 5000 // 5k per batch = fast mails.so processing, no polling timeouts

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
        const idsJson = JSON.stringify(ids.map((r: { id: string }) => r.id))
        await sql`
          INSERT INTO verification_job_items (job_id, contact_id, email)
          SELECT ${sj.id}, id, email
          FROM email_list_contacts
          WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${idsJson}::json))
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

    // Pick ALL queued/running jobs that are due — never touch paused or seeding
    const jobs = await sql`
      SELECT vj.id, vj.user_id, vj.credits_reserved, vj.credits_used, vj.total_emails,
             vj.mailsso_batch_id, vj.mailsso_batch_submitted_at
      FROM verification_jobs vj
      WHERE vj.status IN ('queued', 'running')
        AND vj.next_run_at <= NOW()
      ORDER BY vj.created_at ASC
    `

    if (jobs.length === 0) {
      console.log('[cron/verify] No jobs due — skipping')
      return { processed: 0, message: 'No jobs queued' }
    }

    console.log(`[cron/verify] Processing ${jobs.length} job(s): ${jobs.map((j: { id: string }) => j.id).join(', ')}`)

    // Mark as running — but only those that are still queued/running (not paused by a race condition)
    const jobIdsJson = JSON.stringify(jobs.map((j: { id: string }) => j.id))
    await sql`
      UPDATE verification_jobs SET status = 'running', started_at = COALESCE(started_at, NOW())
      WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${jobIdsJson}::json))
        AND status IN ('queued', 'running')
    `

    // Re-fetch to get only the jobs that are still 'running' (not paused mid-flight)
    const activeJobs = await sql`
      SELECT id, user_id, credits_reserved, credits_used, total_emails,
             mailsso_batch_id, mailsso_batch_submitted_at
      FROM verification_jobs
      WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${jobIdsJson}::json))
        AND status = 'running'
    `

    if (activeJobs.length === 0) {
      console.log('[cron/verify] All jobs paused before processing started')
      return { processed: 0, message: 'All jobs paused' }
    }

    const results = await Promise.all(activeJobs.map((job: typeof activeJobs[0]) => processJob(job)))
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

        // Write results in chunks to avoid query timeout on large batches
        const WRITE_CHUNK = 5000
        if (matched.length > 0) {
          for (let i = 0; i < matched.length; i += WRITE_CHUNK) {
            const chunk = matched.slice(i, i + WRITE_CHUNK)
            const payload = JSON.stringify(chunk.map(x => ({ id: x.id, result: x.r!.status })))
            await sql`
              UPDATE verification_job_items SET
                status = 'completed',
                result = v.result,
                from_cache = false,
                credits_charged = 1,
                processed_at = NOW()
              FROM json_to_recordset(${payload}::json) AS v(id uuid, result text)
              WHERE verification_job_items.id = v.id
            `
          }
          console.log(`[cron/verify] Wrote ${matched.length} results in ${Math.ceil(matched.length/WRITE_CHUNK)} chunks — job=${job.id}`)
        }

        // Store results in cache in chunks
        for (let i = 0; i < results.length; i += WRITE_CHUNK) {
          await storeBatchInCache(results.slice(i, i + WRITE_CHUNK), job.user_id)
        }

        // Update contact statuses — use matched[] directly (only this batch, not all completed)
        if (matched.length > 0) {
          for (let i = 0; i < matched.length; i += WRITE_CHUNK) {
            const chunk = matched.slice(i, i + WRITE_CHUNK)
            const payload = JSON.stringify(chunk.map(x => ({ contact_id: x.id, status: x.r!.status })))
            await sql`
              UPDATE email_list_contacts SET
                verification_status = v.status,
                verified_at = NOW()
              FROM json_to_recordset(${payload}::json) AS v(contact_id uuid, status text)
              WHERE email_list_contacts.id = v.contact_id
            `
          }
          console.log(`[cron/verify] Updated ${matched.length} contacts by contact_id — job=${job.id}`)
        }
      }

      // Clear batch — counters updated by sync_verification_progress cron
      await sql`
        UPDATE verification_jobs SET
          mailsso_batch_id           = NULL,
          mailsso_batch_submitted_at = NULL
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
      const cacheItemsPayload = JSON.stringify(
        cacheHits.map((i: { id: string; email: string }) => ({
          id: i.id,
          result: cacheMap.get(i.email.toLowerCase())!.status,
        }))
      )
      await sql`
        UPDATE verification_job_items SET
          status = 'completed',
          result = v.result,
          from_cache = true,
          credits_charged = 1,
          processed_at = NOW()
        FROM json_to_recordset(${cacheItemsPayload}::json) AS v(id uuid, result text)
        WHERE verification_job_items.id = v.id
      `
      const cacheContactsPayload = JSON.stringify(
        cacheHits.map((i: { id: string; email: string }) => ({
          contact_id: i.id,
          status: cacheMap.get(i.email.toLowerCase())!.status,
        }))
      )
      await sql`
        UPDATE email_list_contacts SET
          verification_status = v.status, verified_at = NOW()
        FROM json_to_recordset(${cacheContactsPayload}::json) AS v(contact_id uuid, status text)
        WHERE email_list_contacts.id = v.contact_id
      `
    }

    // Submit non-cached emails to mails.so batch API
    if (needsApi.length > 0) {
      // Mark as processing
      try {
        const needsApiIdsJson = JSON.stringify(needsApi.map((i: { id: string }) => i.id))
        await sql`
          UPDATE verification_job_items SET status = 'processing'
          WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${needsApiIdsJson}::json))
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
// Counters are kept in sync by the separate sync_verification_progress cron
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

  // Use Number() to pass literals — avoids Neon "$1" error with many params in one statement
  await sql`
    UPDATE verification_jobs SET
      status = 'completed',
      completed_at = NOW(),
      valid_count     = ${Number(s.valid)},
      invalid_count   = ${Number(s.invalid)},
      risky_count     = ${Number(s.risky)},
      unknown_count   = ${Number(s.unknown)},
      catch_all_count = ${Number(s.catch_all)},
      cache_hit_count = ${Number(s.cache_hits)},
      credits_used    = ${Number(s.credits_used)}
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

  // Update list counts — group mails.so statuses correctly
  const listRow = await sql`SELECT list_id FROM verification_jobs WHERE id = ${job.id}`
  const listId = listRow[0]?.list_id
  if (listId) {
    const counts = await sql`
      SELECT
        COUNT(*) FILTER (WHERE verification_status IN ('valid', 'catch_all'))             AS valid_count,
        COUNT(*) FILTER (WHERE verification_status IN ('invalid', 'risky', 'unknown'))    AS invalid_count,
        COUNT(*) FILTER (WHERE verification_status IS NULL OR verification_status = 'unverified') AS unverified_count
      FROM email_list_contacts
      WHERE list_id = ${listId}
    `
    const { valid_count, invalid_count, unverified_count } = counts[0]
    await sql`
      UPDATE email_lists SET
        valid_count      = ${Number(valid_count)},
        invalid_count    = ${Number(invalid_count)},
        unverified_count = ${Number(unverified_count)},
        updated_at       = NOW()
      WHERE id = ${listId}
    `
    console.log(`[cron/verify] Updated list=${listId} valid=${valid_count} invalid=${invalid_count} unverified=${unverified_count}`)
  }

  return { jobCompleted: job.id, ...s }
}
