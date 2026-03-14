import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

/**
 * POST /api/lists/[id]/contacts/batch
 * Body: { rows: [{email, first_name, last_name}], done?: boolean, total?: number, duplicates?: number }
 *
 * Receives pre-parsed batches from the browser worker and inserts them directly.
 * No file download, no CSV parsing on the server.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params

  const list = await sql`
    SELECT id, status FROM email_lists WHERE id = ${id} AND user_id = ${session.id}
  `
  if (!list[0]) return notFound('List')

  try {
    const body = await request.json()
    const { rows, done, total, duplicates } = body as {
      rows?: Array<{ email: string; first_name: string | null; last_name: string | null }>
      done?: boolean
      total?: number
      duplicates?: number
    }

    // Insert the batch
    if (rows && rows.length > 0) {
      // Ensure list is marked as processing
      if (list[0].status === 'pending') {
        await sql`
          UPDATE email_lists SET status = 'processing', processing_started_at = NOW(), processing_progress = 0
          WHERE id = ${id}
        `
      }

      // Filter invalid rows and normalize emails
      const valid = rows.filter(r => r.email && r.email.includes('@'))
      if (valid.length > 0) {
        const emails     = valid.map(r => r.email.toLowerCase().trim())
        const firstNames = valid.map(r => r.first_name ?? null)
        const lastNames  = valid.map(r => r.last_name ?? null)
        const listIds    = valid.map(() => id)
        const userIds    = valid.map(() => session.id)

        // Single bulk INSERT using UNNEST — compatible with @neondatabase/serverless
        await sql`
          INSERT INTO email_list_contacts (list_id, user_id, email, first_name, last_name)
          SELECT
            UNNEST(${listIds}::uuid[]),
            UNNEST(${userIds}::uuid[]),
            UNNEST(${emails}::text[]),
            UNNEST(${firstNames}::text[]),
            UNNEST(${lastNames}::text[])
          ON CONFLICT (list_id, email) DO NOTHING
        `
      }
    }

    // If browser signals completion, finalize the list
    if (done) {
      await sql`
        UPDATE email_lists SET
          status = 'ready',
          total_count = ${total ?? 0},
          unverified_count = ${total ?? 0},
          duplicate_count = ${duplicates ?? 0},
          valid_count = 0,
          processing_progress = 100,
          processing_completed_at = NOW()
        WHERE id = ${id}
      `
    }

    return ok({ inserted: rows?.length ?? 0, done: done ?? false })
  } catch (e) {
    console.error('[contacts/batch]', e)
    await sql`UPDATE email_lists SET status = 'error' WHERE id = ${id}`
    return error('Failed to insert batch', 500)
  }
}
