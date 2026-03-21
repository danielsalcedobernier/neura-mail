export const maxDuration = 55
import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { ok, error } from '@/lib/api'

const SEED_CHUNK = 50000

function auth(req: NextRequest) {
  const s = process.env.CRON_SECRET
  if (!s) return true
  return req.headers.get('authorization') === `Bearer ${s}`
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return error('Unauthorized', 401)
  const result = await withCronLock('verify_seed', async () => {
    const jobs = await sql`
      SELECT id, user_id, list_id, total_emails FROM verification_jobs
      WHERE status = 'seeding' ORDER BY created_at ASC LIMIT 3
    `
    if (jobs.length === 0) return { seeded: 0 }

    let totalSeeded = 0
    for (const sj of jobs) {
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
        const seeded = offset
        if (seeded === 0) {
          await sql`UPDATE verification_jobs SET status='failed', error_message='No emails found' WHERE id=${sj.id}`
        } else {
          await sql`UPDATE verification_jobs SET status='cache_sweeping', total_emails=${seeded}, next_run_at=NOW() WHERE id=${sj.id}`
        }
      } else {
        const idsArr = ids.map((r: { id: string }) => r.id)
        await sql`
          INSERT INTO verification_job_items (job_id, contact_id, email)
          SELECT ${sj.id}, id, email FROM email_list_contacts
          WHERE id = ANY(${idsArr}::uuid[])
            AND (verification_status IS NULL OR verification_status = 'unverified')
          ON CONFLICT DO NOTHING
        `
        totalSeeded += ids.length
      }
    }
    return { seeded: totalSeeded }
  })
  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
