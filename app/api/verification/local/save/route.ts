import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, error, serverError } from '@/lib/api'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

/**
 * POST /api/verification/local/save
 * Receives results from mails.so, writes to verification_job_items and email_list_contacts.
 * Called after the browser polls and gets status === 'completed'.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await req.json()
    const { job_id, items } = body as {
      job_id: string
      items: { id: string; email: string; status: string }[]
    }

    if (!job_id || !Array.isArray(items) || items.length === 0) {
      return error('job_id and items[] required', 400)
    }

    // Verify job belongs to user
    const jobs = await sql`
      SELECT id FROM verification_jobs WHERE id = ${job_id} AND user_id = ${session.id}
    `
    if (jobs.length === 0) return unauthorized()

    // Write results to verification_job_items using item id
    const payload = JSON.stringify(items.map(x => ({ id: x.id, result: x.status })))
    await sql`
      UPDATE verification_job_items SET
        status = 'completed',
        result = v.result,
        from_cache = false,
        credits_charged = 1,
        processed_at = NOW()
      FROM json_to_recordset(${payload}::json) AS v(id uuid, result text)
      WHERE verification_job_items.id = v.id
    `

    // Update email_list_contacts via verification_job_items.contact_id (not item.id)
    const contactsPayload = JSON.stringify(items.map(x => ({ item_id: x.id, status: x.status })))
    await sql`
      UPDATE email_list_contacts SET
        verification_status = v.status,
        verified_at = NOW()
      FROM json_to_recordset(${contactsPayload}::json) AS v(item_id uuid, status text)
      JOIN verification_job_items ji ON ji.id = v.item_id
      WHERE email_list_contacts.id = ji.contact_id
    `

    return ok({ saved: items.length })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
