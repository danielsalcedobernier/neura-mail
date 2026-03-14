import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { checkCacheFirst, verifyEmail, storeInCache } from '@/lib/mailsso'
import { ok, error } from '@/lib/api'

// Called by external cron every minute
// Set CRON_SECRET env var and use it as Bearer token
function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // dev mode: allow all
  const auth = request.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return error('Unauthorized', 401)
  }

  const result = await withCronLock('process_verification_queue', async () => {
    // Pick one running or queued job with pending items
    const jobs = await sql`
      SELECT vj.id, vj.user_id, vj.batch_size, vj.credits_reserved, vj.credits_used
      FROM verification_jobs vj
      WHERE vj.status IN ('queued', 'running')
        AND vj.next_run_at <= NOW()
      ORDER BY vj.created_at ASC
      LIMIT 1
    `
    if (!jobs[0]) return { processed: 0, message: 'No jobs queued' }

    const job = jobs[0]

    // Mark as running
    await sql`
      UPDATE verification_jobs SET status = 'running', started_at = COALESCE(started_at, NOW())
      WHERE id = ${job.id}
    `

    // Grab a batch of pending items
    const items = await sql`
      SELECT id, email FROM verification_job_items
      WHERE job_id = ${job.id} AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT ${job.batch_size}
    `

    if (items.length === 0) {
      // Job complete
      const stats = await sql`
        SELECT
          COUNT(*) FILTER (WHERE result = 'valid') as valid,
          COUNT(*) FILTER (WHERE result = 'invalid') as invalid,
          COUNT(*) FILTER (WHERE result = 'risky') as risky,
          COUNT(*) FILTER (WHERE result = 'unknown') as unknown,
          COUNT(*) FILTER (WHERE result = 'catch_all') as catch_all,
          COUNT(*) FILTER (WHERE from_cache = true) as cache_hits,
          SUM(credits_charged) as credits_used
        FROM verification_job_items
        WHERE job_id = ${job.id}
      `
      const s = stats[0]
      await sql`
        UPDATE verification_jobs SET
          status = 'completed', completed_at = NOW(),
          valid_count = ${s.valid || 0}, invalid_count = ${s.invalid || 0},
          risky_count = ${s.risky || 0}, unknown_count = ${s.unknown || 0},
          catch_all_count = ${s.catch_all || 0}, cache_hit_count = ${s.cache_hits || 0},
          credits_used = ${s.credits_used || 0}
        WHERE id = ${job.id}
      `
      // Refund unused reserved credits
      const usedCredits = Number(s.credits_used || 0)
      const reserved = Number(job.credits_reserved || 0)
      const refund = reserved - usedCredits
      if (refund > 0) {
        await sql`
          UPDATE user_credits SET balance = balance + ${refund}, updated_at = NOW()
          WHERE user_id = ${job.user_id}
        `
      }
      return { processed: 0, jobCompleted: job.id }
    }

    let processed = 0
    for (const item of items) {
      // Mark item as processing
      await sql`UPDATE verification_job_items SET status = 'processing' WHERE id = ${item.id}`

      try {
        // Check global cache first (free)
        const cached = await checkCacheFirst(item.email)
        let result = cached

        let creditsCharged = 0
        let fromCache = false

        if (cached) {
          fromCache = true
        } else {
          // Call mails.so — costs 1 credit
          result = await verifyEmail(item.email)
          await storeInCache(result, job.user_id)
          creditsCharged = 1
        }

        if (!result) throw new Error('No verification result')

        // Update job item
        await sql`
          UPDATE verification_job_items SET
            status = 'completed', result = ${result.status},
            from_cache = ${fromCache}, credits_charged = ${creditsCharged},
            processed_at = NOW()
          WHERE id = ${item.id}
        `

        // Update contact verification status
        await sql`
          UPDATE email_list_contacts SET
            verification_status = ${result.status},
            verification_score = ${result.score},
            verified_at = NOW()
          WHERE email = ${item.email} AND user_id = ${job.user_id}
        `

        processed++
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        await sql`
          UPDATE verification_job_items SET
            status = 'failed', error_message = ${msg}, processed_at = NOW()
          WHERE id = ${item.id}
        `
      }
    }

    // Update job progress
    const progress = await sql`
      SELECT COUNT(*) as done FROM verification_job_items
      WHERE job_id = ${job.id} AND status IN ('completed', 'failed', 'skipped')
    `
    const total = await sql`SELECT total_emails FROM verification_jobs WHERE id = ${job.id}`
    const totalEmails = Number(total[0]?.total_emails || 1)
    const done = Number(progress[0]?.done || 0)

    await sql`
      UPDATE verification_jobs SET
        processed_emails = ${done},
        next_run_at = NOW() + INTERVAL '5 seconds'
      WHERE id = ${job.id}
    `

    // Update list valid/invalid counts
    await sql`
      UPDATE email_lists SET
        valid_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = email_lists.id AND verification_status = 'valid'),
        invalid_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = email_lists.id AND verification_status = 'invalid'),
        unverified_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = email_lists.id AND verification_status = 'unverified')
      WHERE id = (SELECT list_id FROM verification_jobs WHERE id = ${job.id})
    `

    return { processed, total: totalEmails, done }
  })

  if (!result.ran) return ok({ skipped: true, reason: 'Already running' })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
