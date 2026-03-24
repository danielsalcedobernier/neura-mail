export const maxDuration = 300

import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { ok, error } from '@/lib/api'

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  const result = await withCronLock('send_campaign_scheduled', async () => {
    // Activate campaigns whose scheduled_at has passed
    const activated = await sql`
      UPDATE campaigns
      SET status = 'running', started_at = NOW()
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      RETURNING id, name
    `
    console.log(`[cron/send_campaign_scheduled] Activated ${activated.length} campaign(s)`)

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name = 'send_campaign_scheduled'
    `

    return { activated: activated.length, campaigns: activated.map((c: { id: string; name: string }) => c.id) }
  })

  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
