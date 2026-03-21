export const maxDuration = 55
import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { checkCacheBulk } from '@/lib/mailsso'
import { ok, error } from '@/lib/api'

const SWEEP_CHUNK = 10000
const CACHE_CHUNK = 2000
const WRITE_CHUNK = 2000

function auth(req: NextRequest) {
  const s = process.env.CRON_SECRET
  if (!s) return true
  return req.headers.get('authorization') === `Bearer ${s}`
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return error('Unauthorized', 401)
  const result = await withCronLock('verify_sweep', async () => {
    const jobs = await sql`
      SELECT id, user_id FROM verification_jobs
      WHERE status = 'cache_sweeping' ORDER BY created_at ASC LIMIT 3
    `
    if (jobs.length === 0) return { swept: 0 }

    let totalHits = 0
    for (const sw of jobs) {
      const items = await sql`
        SELECT id, email FROM verification_job_items
        WHERE job_id = ${sw.id} AND status = 'pending'
        ORDER BY id LIMIT ${SWEEP_CHUNK}
      `
      if (items.length === 0) {
        await sql`UPDATE verification_jobs SET status='queued', next_run_at=NOW() WHERE id=${sw.id}`
        continue
      }

      const hits: { id: string; email: string; status: string }[] = []
      for (let ci = 0; ci < items.length; ci += CACHE_CHUNK) {
        const sub = items.slice(ci, ci + CACHE_CHUNK)
        const map = await checkCacheBulk(sub.map((i: { email: string }) => i.email))
        for (const item of sub) {
          const hit = map.get((item.email as string).toLowerCase())
          if (hit) hits.push({ id: item.id as string, email: item.email as string, status: hit.status })
        }
      }

      if (hits.length > 0) {
        for (let i = 0; i < hits.length; i += WRITE_CHUNK) {
          const chunk = hits.slice(i, i + WRITE_CHUNK)
          const ip = JSON.stringify(chunk.map(h => ({ id: h.id, result: h.status })))
          await sql`
            UPDATE verification_job_items SET status='completed', result=v.result,
              from_cache=true, credits_charged=1, processed_at=NOW()
            FROM json_to_recordset(${ip}::json) AS v(id uuid, result text)
            WHERE verification_job_items.id = v.id
          `
          const cp = JSON.stringify(chunk.map(h => ({ contact_id: h.id, status: h.status })))
          await sql`
            UPDATE email_list_contacts SET verification_status=v.status, verified_at=NOW()
            FROM json_to_recordset(${cp}::json) AS v(contact_id uuid, status text)
            WHERE email_list_contacts.id = v.contact_id
          `
          totalHits += chunk.length
        }
      }
      await sql`UPDATE verification_jobs SET next_run_at=NOW() WHERE id=${sw.id}`
    }
    return { swept: totalHits }
  })
  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
