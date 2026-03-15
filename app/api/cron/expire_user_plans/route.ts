import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { ok, error } from '@/lib/api'

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  try {
    // Expire active plans that have passed their expiry date
    const expired = await sql`
      UPDATE user_plans SET status = 'expired'
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW()
      RETURNING id, user_id, plan_id
    `
    console.log(`[cron/expire_user_plans] Expired ${expired.length} plans`)

    // Update users.updated_at to signal their plan changed (users has no 'plan' column — plan is read from user_plans)
    if (expired.length > 0) {
      const userIds = expired.map((r: { user_id: string }) => r.user_id)
      await sql`
        UPDATE users SET updated_at = NOW()
        WHERE id = ANY(${userIds}::uuid[])
      `
      console.log(`[cron/expire_user_plans] Marked ${userIds.length} users as updated after plan expiry`)
    }

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name = 'expire_user_plans'
    `

    return ok({ expired: expired.length })
  } catch (e) {
    console.error('[cron/expire_user_plans]', e)
    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'error', run_count = run_count + 1
      WHERE name = 'expire_user_plans'
    `.catch(() => {})
    return error('expire_user_plans failed', 500)
  }
}
