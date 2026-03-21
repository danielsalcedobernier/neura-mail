export const maxDuration = 55
import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { checkCacheBulk, submitBatch, pollBatch, storeBatchInCache } from '@/lib/mailsso'
import { ok, error } from '@/lib/api'

const BATCH_SIZE  = 25000
const CACHE_CHUNK = 2000
const WRITE_CHUNK = 2000

function auth(req: NextRequest) {
  const s = process.env.CRON_SECRET
  if (!s) return true
  return req.headers.get('authorization') === `Bearer ${s}`
}

async function failJob(job: { id: string; user_id: string; credits_reserved: number }, reason: string) {
  const charged = await sql`SELECT COALESCE(SUM(credits_charged),0) AS t FROM verification_job_items WHERE job_id=${job.id} AND status='completed'`
  const refund = Number(job.credits_reserved) - Number(charged[0].t)
  await sql`UPDATE verification_jobs SET status='failed', completed_at=NOW(), error_message=${reason} WHERE id=${job.id}`
  if (refund > 0) await sql`UPDATE user_credits SET balance=balance+${refund}, updated_at=NOW() WHERE user_id=${job.user_id}`
}

async function finalizeJob(job: { id: string; user_id: string; credits_reserved: number }) {
  const remaining = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id=${job.id} AND status='pending'`
  if (Number(remaining[0].c) > 0) {
    await sql`UPDATE verification_jobs SET next_run_at=NOW() WHERE id=${job.id}`
    return { continued: true }
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
    FROM verification_job_items WHERE job_id=${job.id}
  `
  const s = stats[0]
  await sql`
    UPDATE verification_jobs SET status='completed', completed_at=NOW(),
      valid_count=${Number(s.valid)}, invalid_count=${Number(s.invalid)},
      risky_count=${Number(s.risky)}, unknown_count=${Number(s.unknown)},
      catch_all_count=${Number(s.catch_all)}, cache_hit_count=${Number(s.cache_hits)},
      credits_used=${Number(s.credits_used)}
    WHERE id=${job.id}
  `
  const unprocessed = await sql`SELECT COUNT(*) AS c FROM verification_job_items WHERE job_id=${job.id} AND status!='completed'`
  const refund = Number(unprocessed[0].c)
  if (refund > 0) await sql`UPDATE user_credits SET balance=balance+${refund}, updated_at=NOW() WHERE user_id=${job.user_id}`

  const listRow = await sql`SELECT list_id FROM verification_jobs WHERE id=${job.id}`
  const listId = listRow[0]?.list_id
  if (listId) {
    await sql`
      UPDATE email_lists SET
        valid_count   = (SELECT COALESCE(SUM(valid_count),0)   FROM verification_jobs WHERE list_id=${listId} AND status='completed'),
        invalid_count = (SELECT COALESCE(SUM(invalid_count),0) FROM verification_jobs WHERE list_id=${listId} AND status='completed'),
        verified_at   = NOW()
      WHERE id = ${listId}
    `
  }
  return { finalized: true }
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return error('Unauthorized', 401)
  const result = await withCronLock('verify_process', async () => {

    // Fail genuinely stuck jobs (>2h no progress)
    const stuck = await sql`
      SELECT id, user_id, credits_reserved FROM verification_jobs
      WHERE status='running' AND next_run_at < NOW() - INTERVAL '2 hours'
    `
    for (const j of stuck) await failJob(j, 'Stuck: no progress for 2 hours')

    const activeJobs = await sql`
      SELECT id, user_id, credits_reserved, mailsso_batch_id, mailsso_batch_submitted_at
      FROM verification_jobs
      WHERE status IN ('queued','running') AND next_run_at <= NOW()
      ORDER BY created_at ASC LIMIT 10
    `
    if (activeJobs.length === 0) return { processed: 0 }

    const jobIdsArr = activeJobs.map((j: { id: string }) => j.id)
    await sql`UPDATE verification_jobs SET status='running', started_at=COALESCE(started_at,NOW()) WHERE id=ANY(${jobIdsArr}::uuid[])`

    // ── Poll existing batch ───────────────────────────────────────────────────
    const jobWithBatch = activeJobs.find((j: { mailsso_batch_id: string | null }) => j.mailsso_batch_id)
    if (jobWithBatch) {
      const batchId = jobWithBatch.mailsso_batch_id as string
      const waitedMs = Date.now() - new Date(jobWithBatch.mailsso_batch_submitted_at as string).getTime()
      if (waitedMs > 2 * 60 * 60 * 1000) {
        for (const j of activeJobs) await failJob(j, 'Batch timeout')
        return { batchTimeout: batchId }
      }
      let results
      try { results = await pollBatch(batchId) } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('401') || msg.includes('403') || msg.includes('404')) {
          for (const j of activeJobs) await failJob(j, `Poll error: ${msg}`)
          return { pollFailed: true }
        }
        await sql`UPDATE verification_jobs SET next_run_at=NOW()+INTERVAL '60 seconds' WHERE id=ANY(${jobIdsArr}::uuid[])`
        return { retrying: true }
      }
      if (results === null) {
        await sql`UPDATE verification_jobs SET next_run_at=NOW()+INTERVAL '30 seconds' WHERE id=ANY(${jobIdsArr}::uuid[])`
        return { waiting: true }
      }
      const resultMap = new Map(results.map(r => [r.email.toLowerCase(), r]))
      for (const job of activeJobs) {
        const items = await sql`SELECT id, email FROM verification_job_items WHERE job_id=${job.id} AND status='processing'`
        if (!items.length) continue
        for (let i = 0; i < items.length; i += WRITE_CHUNK) {
          const chunk = items.slice(i, i + WRITE_CHUNK).map((x: { id: string; email: string }) => ({ id: x.id, result: resultMap.get(x.email.toLowerCase())?.status ?? 'unknown' }))
          const p = JSON.stringify(chunk)
          await sql`UPDATE verification_job_items SET status='completed', result=v.result, from_cache=false, credits_charged=1, processed_at=NOW() FROM json_to_recordset(${p}::json) AS v(id uuid, result text) WHERE verification_job_items.id=v.id`
          const cp = JSON.stringify(chunk.map((x: { id: string; result: string }) => ({ contact_id: x.id, status: x.result })))
          await sql`UPDATE email_list_contacts SET verification_status=v.status, verified_at=NOW() FROM json_to_recordset(${cp}::json) AS v(contact_id uuid, status text) WHERE email_list_contacts.id=v.contact_id`
        }
        await sql`UPDATE verification_jobs SET mailsso_batch_id=NULL, mailsso_batch_submitted_at=NULL WHERE id=${job.id}`
      }
      for (let i = 0; i < results.length; i += WRITE_CHUNK) await storeBatchInCache(results.slice(i, i + WRITE_CHUNK), jobWithBatch.user_id)
      const finals = []
      for (const j of activeJobs) finals.push(await finalizeJob(j))
      return { distributed: results.length, jobs: finals }
    }

    // ── Collect pending, check cache, submit to mails.so ─────────────────────
    const emailToItems = new Map<string, { jobId: string; itemId: string }[]>()
    for (const job of activeJobs) {
      const items = await sql`SELECT id, email FROM verification_job_items WHERE job_id=${job.id} AND status='pending' ORDER BY id LIMIT ${BATCH_SIZE}`
      if (!items.length) continue
      const hits: { id: string; status: string }[] = []
      const needSet = new Set<string>()
      for (let ci = 0; ci < items.length; ci += CACHE_CHUNK) {
        const sub = items.slice(ci, ci + CACHE_CHUNK)
        const map = await checkCacheBulk(sub.map((i: { email: string }) => i.email))
        for (const item of sub) {
          const hit = map.get((item.email as string).toLowerCase())
          if (hit) hits.push({ id: item.id as string, status: hit.status })
          else needSet.add((item.email as string).toLowerCase())
        }
      }
      if (hits.length) {
        for (let i = 0; i < hits.length; i += WRITE_CHUNK) {
          const chunk = hits.slice(i, i + WRITE_CHUNK)
          const ip = JSON.stringify(chunk.map(h => ({ id: h.id, result: h.status })))
          await sql`UPDATE verification_job_items SET status='completed', result=v.result, from_cache=true, credits_charged=1, processed_at=NOW() FROM json_to_recordset(${ip}::json) AS v(id uuid, result text) WHERE verification_job_items.id=v.id`
          const cp = JSON.stringify(chunk.map(h => ({ contact_id: h.id, status: h.status })))
          await sql`UPDATE email_list_contacts SET verification_status=v.status, verified_at=NOW() FROM json_to_recordset(${cp}::json) AS v(contact_id uuid, status text) WHERE email_list_contacts.id=v.contact_id`
        }
      }
      for (const item of items.filter((i: { email: string }) => needSet.has((i.email as string).toLowerCase()))) {
        const key = (item.email as string).toLowerCase()
        if (!emailToItems.has(key)) emailToItems.set(key, [])
        emailToItems.get(key)!.push({ jobId: job.id, itemId: item.id as string })
      }
    }

    if (emailToItems.size === 0) {
      for (const j of activeJobs) await finalizeJob(j)
      return { allFromCache: true }
    }

    const uniqueEmails = Array.from(emailToItems.keys()).slice(0, BATCH_SIZE)
    const allItemIds = Array.from(emailToItems.values()).flat().map(x => x.itemId)
    for (let i = 0; i < allItemIds.length; i += WRITE_CHUNK) {
      const chunk = allItemIds.slice(i, i + WRITE_CHUNK)
      await sql`UPDATE verification_job_items SET status='processing' WHERE id=ANY(${chunk}::uuid[])`
    }

    let batchId: string
    try {
      batchId = await submitBatch(uniqueEmails)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      for (let i = 0; i < allItemIds.length; i += WRITE_CHUNK) {
        await sql`UPDATE verification_job_items SET status='pending' WHERE id=ANY(${allItemIds.slice(i, i + WRITE_CHUNK)}::uuid[])`
      }
      if (msg.includes('401') || msg.includes('403') || msg.includes('not configured')) {
        for (const j of activeJobs) await failJob(j, `Submit error: ${msg}`)
        return { submitFailed: true }
      }
      await sql`UPDATE verification_jobs SET next_run_at=NOW()+INTERVAL '60 seconds' WHERE id=ANY(${jobIdsArr}::uuid[])`
      return { retrying: true }
    }

    await sql`UPDATE verification_jobs SET mailsso_batch_id=${batchId}, mailsso_batch_submitted_at=NOW(), next_run_at=NOW()+INTERVAL '30 seconds' WHERE id=ANY(${jobIdsArr}::uuid[])`
    return { submitted: uniqueEmails.length, batchId }
  })
  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
