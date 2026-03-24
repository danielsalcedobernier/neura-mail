import { requireAuth } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error } from '@/lib/api'

export async function GET() {
  try {
    const session = await requireAuth()
    const userId = session.id

    const [sent, verified, verSplit, credits] = await Promise.all([
      sql`
        SELECT
          COALESCE(SUM(sent_count), 0) as total_sent,
          COALESCE(SUM(opened_count), 0) as total_opens,
          COALESCE(SUM(clicked_count), 0) as total_clicks,
          COALESCE(SUM(bounced_count), 0) as total_bounced,
          COALESCE(SUM(delivered_count), 0) as total_delivered
        FROM campaigns WHERE user_id = ${userId}
      `,
      sql`
        SELECT COUNT(*) as verified_emails
        FROM email_list_contacts
        WHERE user_id = ${userId} AND verification_status != 'unverified'
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE verification_status = 'valid') as valid_count,
          COUNT(*) FILTER (WHERE verification_status = 'invalid') as invalid_count,
          COUNT(*) FILTER (WHERE verification_status = 'risky') as risky_count,
          COUNT(*) FILTER (WHERE verification_status = 'unknown') as unknown_count
        FROM email_list_contacts WHERE user_id = ${userId}
      `,
      sql`SELECT balance FROM user_credits WHERE user_id = ${userId}`,
    ])

    return ok({
      total_sent: Number(sent[0]?.total_sent ?? 0),
      total_opens: Number(sent[0]?.total_opens ?? 0),
      total_clicks: Number(sent[0]?.total_clicks ?? 0),
      total_bounced: Number(sent[0]?.total_bounced ?? 0),
      total_delivered: Number(sent[0]?.total_delivered ?? 0),
      verified_emails: Number(verified[0]?.verified_emails ?? 0),
      valid_count: Number(verSplit[0]?.valid_count ?? 0),
      invalid_count: Number(verSplit[0]?.invalid_count ?? 0),
      risky_count: Number(verSplit[0]?.risky_count ?? 0),
      unknown_count: Number(verSplit[0]?.unknown_count ?? 0),
      balance: Number(credits[0]?.balance ?? 0),
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') return error('Unauthorized', 401)
    console.error('[analytics/overview]', err)
    return error('Failed to load analytics', 500)
  }
}
