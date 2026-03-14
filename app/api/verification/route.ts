import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, getUserCredits } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

const createSchema = z.object({
  list_id: z.string().uuid(),
  name: z.string().optional(),
  batch_size: z.number().int().min(10).max(500).default(100),
})

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const jobs = await sql`
    SELECT vj.*, el.name as list_name
    FROM verification_jobs vj
    LEFT JOIN email_lists el ON el.id = vj.list_id
    WHERE vj.user_id = ${session.id}
    ORDER BY vj.created_at DESC
    LIMIT 50
  `
  return ok(jobs)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { list_id, name, batch_size } = parsed.data

    // Check list belongs to user
    const lists = await sql`
      SELECT id, unverified_count, total_count FROM email_lists
      WHERE id = ${list_id} AND user_id = ${session.id} AND status = 'ready'
    `
    if (!lists[0]) return error('List not found or not ready', 404)

    const emailsToVerify = lists[0].unverified_count || 0

    // Check credits
    const credits = await getUserCredits(session.id)
    if (credits < emailsToVerify) {
      return error(`Insufficient credits. Need ${emailsToVerify}, have ${credits}.`, 402)
    }

    // Reserve credits
    await sql`
      UPDATE user_credits SET balance = balance - ${emailsToVerify}, updated_at = NOW()
      WHERE user_id = ${session.id} AND balance >= ${emailsToVerify}
    `

    // Create verification job — worker picks it up via cron
    const rows = await sql`
      INSERT INTO verification_jobs (
        user_id, list_id, name, status, total_emails,
        credits_reserved, batch_size, next_run_at
      ) VALUES (
        ${session.id}, ${list_id},
        ${name || `Verification ${new Date().toLocaleDateString()}`},
        'queued', ${emailsToVerify}, ${emailsToVerify}, ${batch_size}, NOW()
      )
      RETURNING id, status, total_emails, created_at
    `

    // Seed job items from list contacts — NULL and 'unverified' both mean not yet verified
    await sql`
      INSERT INTO verification_job_items (job_id, contact_id, email)
      SELECT ${rows[0].id}, id, email
      FROM email_list_contacts
      WHERE list_id = ${list_id}
        AND (verification_status IS NULL OR verification_status = 'unverified')
        AND user_id = ${session.id}
    `

    return ok(rows[0], 201)
  } catch (e) {
    console.error('[verification POST]', e)
    return error('Failed to create verification job', 500)
  }
}
