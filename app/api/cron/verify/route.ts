export const maxDuration = 55

import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { checkCacheBulk, storeBatchInCache, submitBatch, pollBatch } from '@/lib/mailsso'
import { ok, error } from '@/lib/api'

const BATCH_SIZE   = 25000   // max emails per mails.so call
const SWEEP_CHUNK  = 10000   // emails per cache-sweep tick (keep query fast)
const CACHE_CHUNK  = 2000    // rows per checkCacheBulk call (avoids giant IN queries)
const SEED_CHUNK   = 500000  // contacts per seeding tick
const WRITE_CHUNK  = 2000    // rows per bulk UPDATE

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  const result = await withCronLock('process_verification_queue', async () => {

    // ── PHASE 0: SEEDING ──────────────────────────────────────────────────────
    const seedingJobs = await sql`
      SELECT id, user_id, list_id, total_emails
      FROM verification_jobs WHERE status = 'seeding'
      ORDER BY created_at ASC
    `
    for (const sj of seedingJobs) {
      const countRes = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${sj.id}`
      const offset = Number(countRes[0].c)
      const ids = await sql`
        SELECT id, email FROM email_list_contacts
        WHERE list_id = ${sj.list_id}
          AND (verification_status IS NULL OR verification_status = 'unverified')
          AND user_id = ${sj.user_id}
        ORDER BY id LIMIT ${SEED_CHUNK} OFFSET ${offset}
      `
      if (ids.length === 0) {
        const finalCount = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${sj.id}`
        const seeded = Number(finalCount[0].c)
        if (seeded === 0) {
          await failJob({ id: sj.id, user_id: sj.user_id, credits_reserved: sj.total_emails }, 'No emails found to verify')
        } else {
          await sql`UPDATE verification_jobs SET status='cache_sweeping', total_emails=${seeded}, next_run_at=NOW() WHERE id=${sj.id}`
        }
      } else {
        const idsJson = JSON.stringify(ids.map((r: { id: string }) => r.id))
        await sql`
          INSERT INTO verification_job_items (job_id, contact_id, email)
          SELECT ${sj.id}, id, email FROM email_list_contacts
          WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${idsJson}::json))
            AND (verification_status IS NULL OR verification_status = 'unverified')
          ON CONFLICT DO NOTHING
        `
      }
    }

    // ── PHASE 1: CACHE SWEEP ─────────────────────────────────────────────────
    const sweepingJobs = await sql`
      SELECT id, user_id FROM verification_jobs WHERE status = 'cache_sweeping'
      ORDER BY created_at ASC
    `
    for (const sw of sweepingJobs) {
      const sweepItems = await sql`
        SELECT id, email FROM verification_job_items
        WHERE job_id = ${sw.id} AND status = 'pending'
        ORDER BY id LIMIT ${SWEEP_CHUNK}
      `
      if (sweepItems.length === 0) {
        await sql`UPDATE verification_jobs SET status='queued', next_run_at=NOW() WHERE id=${sw.id}`
        continue
      }
      // Check cache in small sub-batches to avoid giant IN queries timing out
      const cacheHits: { id: string; email: string; status: string }[] = []
      for (let ci = 0; ci < sweepItems.length; ci += CACHE_CHUNK) {
        const subBatch = sweepItems.slice(ci, ci + CACHE_CHUNK)
        const subMap = await checkCacheBulk(subBatch.map((i: { email: string }) => i.email))
        for (const item of subBatch) {
          const hit = subMap.get(item.email.toLowerCase())
          if (hit) cacheHits.push({ id: item.id as string, email: item.email as string, status: hit.status })
        }
      }

      if (cacheHits.length > 0) {
        for (let i = 0; i < cacheHits.length; i += WRITE_CHUNK) {
          const chunk = cacheHits.slice(i, i + WRITE_CHUNK)
          const itemsPayload = JSON.stringify(chunk.map(item => ({ id: item.id, result: item.status })))
          await sql`
            UPDATE verification_job_items SET status='completed', result=v.result,
              from_cache=true, credits_charged=1, processed_at=NOW()
            FROM json_to_recordset(${itemsPayload}::json) AS v(id uuid, result text)
            WHERE verification_job_items.id = v.id
          `
          const contactsPayload = JSON.stringify(chunk.map(item => ({ contact_id: item.id, status: item.status })))
          await sql`
            UPDATE email_list_contacts SET verification_status=v.status, verified_at=NOW()
            FROM json_to_recordset(${contactsPayload}::json) AS v(contact_id uuid, status text)
            WHERE email_list_contacts.id = v.contact_id
          `
        }
      }
      await sql`UPDATE verification_jobs SET next_run_at=NOW() WHERE id=${sw.id}`
    }

    // ── FAIL STUCK JOBS ───────────────────────────────────────────────────────
    const stuckJobs = await sql`
      SELECT id, user_id, credits_reserved FROM verification_jobs
      WHERE status = 'running' AND next_run_at < NOW() - INTERVAL '2 hours'
    `
    for (const stuck of stuckJobs) {
      await failJob(stuck, 'Job stuck: no progress for 2 hours')
    }

    // ── PHASE 2: UNIFIED BATCH ───────────────────────────────────────────────
    // Only pick queued/running — never paused
    const activeJobs = await sql`
      SELECT id, user_id, credits_reserved, credits_used, total_emails,
             mailsso_batch_id, mailsso_batch_submitted_at
      FROM verification_jobs
      WHERE status IN ('queued', 'running')
        AND next_run_at <= NOW()
      ORDER BY created_at ASC
    `

    if (activeJobs.length === 0) {
      return { processed: 0, message: 'No jobs queued' }
    }

    // Mark all as running at once
    const jobIdsJson = JSON.stringify(activeJobs.map((j: { id: string }) => j.id))
    await sql`
      UPDATE verification_jobs SET status='running', started_at=COALESCE(started_at, NOW())
      WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${jobIdsJson}::json))
        AND status IN ('queued', 'running')
    `

    // ── PHASE 2A: Poll existing global batch if any job has one ──────────────
    const jobWithBatch = activeJobs.find((j: { mailsso_batch_id: string | null }) => j.mailsso_batch_id)

    if (jobWithBatch) {
      const batchId = jobWithBatch.mailsso_batch_id as string
      const submittedAt = jobWithBatch.mailsso_batch_submitted_at
        ? new Date(jobWithBatch.mailsso_batch_submitted_at as string).getTime() : 0
      const waitedMs = Date.now() - submittedAt

      if (submittedAt && waitedMs > 2 * 60 * 60 * 1000) {
        // Timeout — fail all jobs sharing this batch
        for (const job of activeJobs) {
          await failJob(job, 'Batch timeout: mails.so did not respond within 2 hours')
        }
        return { batchTimeout: batchId }
      }

      let results
      try {
        results = await pollBatch(batchId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const isPermanent = msg.includes('401') || msg.includes('403') || msg.includes('404') || msg.includes('not found')
        if (isPermanent) {
          for (const job of activeJobs) await failJob(job, `mails.so poll error: ${msg}`)
          return { batchFailed: batchId, reason: msg }
        }
        // Transient — retry in 60s for all jobs
        await sql`
          UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '60 seconds'
          WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${jobIdsJson}::json))
        `
        return { retrying: true, error: msg }
      }

      if (results === null) {
        // Still processing — retry in 30s
        await sql`
          UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '30 seconds'
          WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${jobIdsJson}::json))
        `
        return { waiting: true, batchId }
      }

      // Results ready — distribute to all jobs that have items in 'processing'
      const resultMap = new Map(results.map(r => [r.email.toLowerCase(), r]))

      for (const job of activeJobs) {
        const items = await sql`
          SELECT id, email FROM verification_job_items
          WHERE job_id = ${job.id} AND status = 'processing'
        `
        if (items.length === 0) continue

        const matched = items
          .map((i: { id: string; email: string }) => ({ id: i.id, r: resultMap.get(i.email.toLowerCase()) }))
          .filter((x: { r: unknown }) => x.r)

        if (matched.length > 0) {
          for (let i = 0; i < matched.length; i += WRITE_CHUNK) {
            const chunk = matched.slice(i, i + WRITE_CHUNK)
            const payload = JSON.stringify(chunk.map((x: { id: string; r: { status: string } }) => ({ id: x.id, result: x.r.status })))
            await sql`
              UPDATE verification_job_items SET status='completed', result=v.result,
                from_cache=false, credits_charged=1, processed_at=NOW()
              FROM json_to_recordset(${payload}::json) AS v(id uuid, result text)
              WHERE verification_job_items.id = v.id
            `
            const cpayload = JSON.stringify(chunk.map((x: { id: string; r: { status: string } }) => ({ contact_id: x.id, status: x.r.status })))
            await sql`
              UPDATE email_list_contacts SET verification_status=v.status, verified_at=NOW()
              FROM json_to_recordset(${cpayload}::json) AS v(contact_id uuid, status text)
              WHERE email_list_contacts.id = v.contact_id
            `
          }
        }

        // Clear batch_id on this job
        await sql`
          UPDATE verification_jobs SET mailsso_batch_id=NULL, mailsso_batch_submitted_at=NULL
          WHERE id = ${job.id}
        `
      }

      // Store all results in cache once (deduplicated)
      for (let i = 0; i < results.length; i += WRITE_CHUNK) {
        await storeBatchInCache(results.slice(i, i + WRITE_CHUNK), jobWithBatch.user_id)
      }

      // Finalize or continue each job
      const finalResults = []
      for (const job of activeJobs) {
        finalResults.push(await finalizeOrContinue(job))
      }
      return { batchId, distributed: results.length, jobs: finalResults }
    }

    // ── PHASE 2B: Collect pending emails from ALL jobs, deduplicate, submit ──
    // Map email → list of {jobId, itemId} so we can distribute results back
    const emailToItems = new Map<string, { jobId: string; itemId: string }[]>()

    for (const job of activeJobs) {
      const items = await sql`
        SELECT id, email FROM verification_job_items
        WHERE job_id = ${job.id} AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
      `
      if (items.length === 0) continue

      // Check cache in sub-batches to avoid giant IN queries
      const cacheHits2: { id: string; email: string; status: string }[] = []
      const needsApiSet = new Set<string>()
      for (let ci = 0; ci < items.length; ci += CACHE_CHUNK) {
        const sub = items.slice(ci, ci + CACHE_CHUNK)
        const subMap = await checkCacheBulk(sub.map((i: { email: string }) => i.email))
        for (const item of sub) {
          const hit = subMap.get((item.email as string).toLowerCase())
          if (hit) cacheHits2.push({ id: item.id as string, email: item.email as string, status: hit.status })
          else needsApiSet.add((item.email as string).toLowerCase())
        }
      }
      const needsApi = items.filter((i: { email: string }) => needsApiSet.has((i.email as string).toLowerCase()))

      if (cacheHits2.length > 0) {
        for (let i = 0; i < cacheHits2.length; i += WRITE_CHUNK) {
          const chunk = cacheHits2.slice(i, i + WRITE_CHUNK)
          const ip = JSON.stringify(chunk.map(item => ({ id: item.id, result: item.status })))
          await sql`
            UPDATE verification_job_items SET status='completed', result=v.result,
              from_cache=true, credits_charged=1, processed_at=NOW()
            FROM json_to_recordset(${ip}::json) AS v(id uuid, result text)
            WHERE verification_job_items.id = v.id
          `
          const cp = JSON.stringify(chunk.map(item => ({ contact_id: item.id, status: item.status })))
          await sql`
            UPDATE email_list_contacts SET verification_status=v.status, verified_at=NOW()
            FROM json_to_recordset(${cp}::json) AS v(contact_id uuid, status text)
            WHERE email_list_contacts.id = v.contact_id
          `
        }
      }

      // Accumulate emails that need API — deduplicate across jobs
      for (const item of needsApi) {
        const key = (item.email as string).toLowerCase()
        if (!emailToItems.has(key)) emailToItems.set(key, [])
        emailToItems.get(key)!.push({ jobId: job.id, itemId: item.id as string })
      }
    }

    // Check if all jobs resolved from cache
    const allCacheResolved = emailToItems.size === 0
    if (allCacheResolved) {
      const finalResults = []
      for (const job of activeJobs) finalResults.push(await finalizeOrContinue(job))
      return { allFromCache: true, jobs: finalResults }
    }

    const uniqueEmails = Array.from(emailToItems.keys())

    // Mark all these items as 'processing' across all jobs
    const allItemIds = Array.from(emailToItems.values()).flat().map(x => x.itemId)
    for (let i = 0; i < allItemIds.length; i += WRITE_CHUNK) {
      const chunk = allItemIds.slice(i, i + WRITE_CHUNK)
      const idsJson = JSON.stringify(chunk)
      await sql`
        UPDATE verification_job_items SET status='processing'
        WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${idsJson}::json))
      `
    }

    // ONE call to mails.so with all unique emails (max BATCH_SIZE)
    const emailsToSubmit = uniqueEmails.slice(0, BATCH_SIZE)
    let batchId: string
    try {
      batchId = await submitBatch(emailsToSubmit)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Reset processing → pending so next tick retries
      for (let i = 0; i < allItemIds.length; i += WRITE_CHUNK) {
        const chunk = allItemIds.slice(i, i + WRITE_CHUNK)
        const idsJson = JSON.stringify(chunk)
        await sql`
          UPDATE verification_job_items SET status='pending'
          WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${idsJson}::json))
        `
      }
      const isPermanent = msg.includes('401') || msg.includes('403') || msg.includes('not configured')
      if (isPermanent) {
        for (const job of activeJobs) await failJob(job, `mails.so submit error: ${msg}`)
        return { submitFailed: true, reason: msg }
      }
      await sql`
        UPDATE verification_jobs SET next_run_at = NOW() + INTERVAL '60 seconds'
        WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${jobIdsJson}::json))
      `
      return { retrying: true, error: msg }
    }

    // Store the SAME batchId on ALL active jobs so next tick they all poll together
    await sql`
      UPDATE verification_jobs
      SET mailsso_batch_id = ${batchId}, mailsso_batch_submitted_at = NOW(),
          next_run_at = NOW() + INTERVAL '30 seconds'
      WHERE id = ANY(SELECT value::uuid FROM json_array_elements_text(${jobIdsJson}::json))
    `

    return {
      submitted: emailsToSubmit.length,
      deduplicated: uniqueEmails.length - emailsToSubmit.length,
      batchId,
      jobs: activeJobs.length,
    }
  })

  if (!result.ran) return ok({ skipped: true, reason: 'Already running' })
  if (result.error) {
    const isConfigError = result.error.includes('not configured') || result.error.includes('API key')
    if (isConfigError) return ok({ skipped: true, reason: result.error })
    return error(result.error, 500)
  }
  return ok(result.result)
}

// ── Helpers ──��─────────────────────────────────────────────────────────────

async function failJob(job: { id: string; user_id: string; credits_reserved: number }, reason: string) {
  const charged = await sql`
    SELECT COALESCE(SUM(credits_charged), 0) AS total
    FROM verification_job_items WHERE job_id = ${job.id} AND status = 'completed'
  `
  const refund = Number(job.credits_reserved) - Number(charged[0].total)
  await sql`
    UPDATE verification_jobs SET status='failed', completed_at=NOW(), error_message=${reason}
    WHERE id = ${job.id}
  `
  if (refund > 0) {
    await sql`UPDATE user_credits SET balance=balance+${refund}, updated_at=NOW() WHERE user_id=${job.user_id}`
  }
  return { jobFailed: job.id, reason, refund }
}

async function finalizeOrContinue(job: { id: string; user_id: string; credits_reserved: number }) {
  const remaining = await sql`
    SELECT COUNT(*) AS count FROM verification_job_items
    WHERE job_id = ${job.id} AND status = 'pending'
  `
  if (Number(remaining[0].count) > 0) {
    await sql`UPDATE verification_jobs SET next_run_at=NOW() WHERE id=${job.id}`
    return { continued: true, remaining: remaining[0].count }
  }
  return await finalizeJob(job)
}

async function finalizeJob(job: { id: string; user_id: string; credits_reserved: number; total_emails?: number }) {
  const completedCount = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id = ${job.id}`
  if (Number(completedCount[0].c) === 0 && Number(job.total_emails ?? 0) > 0) {
    await sql`UPDATE verification_jobs SET next_run_at=NOW()+INTERVAL '1 minute' WHERE id=${job.id}`
    return { skipped: true, reason: 'No completed items yet' }
  }

  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE result='valid')     AS valid,
      COUNT(*) FILTER (WHERE result='invalid')   AS invalid,
      COUNT(*) FILTER (WHERE result='risky')     AS risky,
      COUNT(*) FILTER (WHERE result='unknown')   AS unknown,
      COUNT(*) FILTER (WHERE result='catch_all') AS catch_all,
      COUNT(*) FILTER (WHERE from_cache=true)    AS cache_hits,
      COALESCE(SUM(credits_charged),0)           AS credits_used
    FROM verification_job_items WHERE job_id = ${job.id}
  `
  const s = stats[0]

  await sql`
    UPDATE verification_jobs SET
      status='completed', completed_at=NOW(),
      valid_count=${Number(s.valid)}, invalid_count=${Number(s.invalid)},
      risky_count=${Number(s.risky)}, unknown_count=${Number(s.unknown)},
      catch_all_count=${Number(s.catch_all)}, cache_hit_count=${Number(s.cache_hits)},
      credits_used=${Number(s.credits_used)}
    WHERE id = ${job.id}
  `

  const unprocessed = await sql`
    SELECT COUNT(*) AS count FROM verification_job_items WHERE job_id=${job.id} AND status!='completed'
  `
  const refund = Number(unprocessed[0].count)
  if (refund > 0) {
    await sql`UPDATE user_credits SET balance=balance+${refund}, updated_at=NOW() WHERE user_id=${job.user_id}`
  }

  const listRow = await sql`SELECT list_id FROM verification_jobs WHERE id=${job.id}`
  const listId = listRow[0]?.list_id
  if (listId) {
    await sql`
      UPDATE email_lists SET
        valid_count      = (SELECT COALESCE(SUM(valid_count),0)   FROM verification_jobs WHERE list_id=${listId} AND status='completed'),
        invalid_count    = (SELECT COALESCE(SUM(invalid_count),0) FROM verification_jobs WHERE list_id=${listId} AND status='completed'),
        unverified_count = GREATEST(0, total_count - (
          SELECT COALESCE(SUM(valid_count+invalid_count+risky_count+catch_all_count+unknown_count),0)
          FROM verification_jobs WHERE list_id=${listId} AND status='completed'
        )),
        updated_at = NOW()
      WHERE id = ${listId}
    `
  }

  return { jobCompleted: job.id, ...s }
}
