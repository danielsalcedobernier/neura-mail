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
    if (!parsed.success) {
      console.error('[verification POST] Invalid input:', parsed.error.flatten())
      return error('Invalid input', 422)
    }

    const { list_id, name, batch_size } = parsed.data
    console.log(`[verification POST] user=${session.id} list=${list_id} batch_size=${batch_size}`)

    // Check list belongs to user
    const lists = await sql`
      SELECT id, unverified_count, total_count FROM email_lists
      WHERE id = ${list_id} AND user_id = ${session.id} AND status = 'ready'
    `
    if (!lists[0]) {
      console.error(`[verification POST] List not found or not ready: list_id=${list_id} user=${session.id}`)
      return error('List not found or not ready', 404)
    }

    // Always count directly from the contacts table — the cached counter can be stale
    const countResult = await sql`
      SELECT COUNT(*) AS total FROM email_list_contacts
      WHERE list_id = ${list_id}
        AND user_id = ${session.id}
        AND (verification_status IS NULL OR verification_status = 'unverified')
    `
    const emailsToVerify = Number(countResult[0].total) || 0
    console.log(`[verification POST] emailsToVerify=${emailsToVerify} cached_unverified=${lists[0].unverified_count}`)

    // Sync the cached counter while we're here
    if (emailsToVerify !== Number(lists[0].unverified_count)) {
      console.log(`[verification POST] Syncing unverified_count: ${lists[0].unverified_count} → ${emailsToVerify}`)
      await sql`UPDATE email_lists SET unverified_count = ${emailsToVerify} WHERE id = ${list_id}`
    }

    if (emailsToVerify === 0) {
      console.warn(`[verification POST] No emails to verify for list=${list_id}`)
      return error('No unverified emails in this list', 400)
    }

    // Check credits
    const credits = await getUserCredits(session.id)
    console.log(`[verification POST] credits available=${credits} needed=${emailsToVerify}`)
    if (credits < emailsToVerify) {
      return error(`Insufficient credits. Need ${emailsToVerify}, have ${credits}.`, 402)
    }

    // Reserve credits
    await sql`
      UPDATE user_credits SET balance = balance - ${emailsToVerify}, updated_at = NOW()
      WHERE user_id = ${session.id} AND balance >= ${emailsToVerify}
    `
    console.log(`[verification POST] Reserved ${emailsToVerify} credits`)

    // Create job in 'seeding' status — cron will not pick it up until seed completes
    const rows = await sql`
      INSERT INTO verification_jobs (
        user_id, list_id, name, status, total_emails,
        credits_reserved, batch_size, next_run_at
      ) VALUES (
        ${session.id}, ${list_id},
        ${name || `Verification ${new Date().toLocaleDateString()}`},
        'seeding', ${emailsToVerify}, ${emailsToVerify}, ${batch_size}, NOW() + INTERVAL '2 minutes'
      )
      RETURNING id, status, total_emails, created_at
    `
    const jobId = rows[0].id
    console.log(`[verification POST] Job created: id=${jobId} status=seeding`)

    // Seed job items in chunks of 50k to avoid query timeouts on large lists
    const SEED_CHUNK = 50000
    let offset = 0
    let seeded = 0
    while (true) {
      const ids = await sql`
        SELECT id, email FROM email_list_contacts
        WHERE list_id = ${list_id}
          AND (verification_status IS NULL OR verification_status = 'unverified')
          AND user_id = ${session.id}
        ORDER BY id
        LIMIT ${SEED_CHUNK} OFFSET ${offset}
      `
      if (ids.length === 0) {
        console.log(`[verification POST] Seed complete: offset=${offset} seeded=${seeded}`)
        break
      }

      await sql`
        INSERT INTO verification_job_items (job_id, contact_id, email)
        SELECT ${jobId}, id, email
        FROM email_list_contacts
        WHERE id = ANY(${ids.map((r: { id: string }) => r.id)}::uuid[])
          AND (verification_status IS NULL OR verification_status = 'unverified')
      `
      seeded += ids.length
      console.log(`[verification POST] Seeded chunk: offset=${offset} chunk=${ids.length} total_seeded=${seeded}`)
      if (ids.length < SEED_CHUNK) break
      offset += SEED_CHUNK
    }

    // Seed complete — set to queued so cron picks it up immediately
    await sql`
      UPDATE verification_jobs
      SET status = 'queued', total_emails = ${seeded}, next_run_at = NOW()
      WHERE id = ${jobId}
    `
    console.log(`[verification POST] Job ${jobId} → queued with ${seeded} items`)

    return ok({ ...rows[0], total_emails: seeded }, 201)
  } catch (e) {
    console.error('[verification POST] Unhandled error:', e)
    return error('Failed to create verification job', 500)
  }
}
