import { NextRequest } from 'next/server'
import { Pool } from 'pg'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export const maxDuration = 300

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

    if (rows && rows.length > 0) {
      if (list[0].status === 'pending') {
        await sql`
          UPDATE email_lists SET status = 'processing', processing_started_at = NOW(), processing_progress = 0
          WHERE id = ${id}
        `
      }

      const valid = rows.filter(r => r.email && typeof r.email === 'string' && r.email.includes('@'))
      if (valid.length > 0) {
        const emails = valid.map(r => r.email.toLowerCase().trim())
        const firstNames = valid.map(r => r.first_name ?? null)
        const lastNames = valid.map(r => r.last_name ?? null)

        const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
        await pool.query(
          `INSERT INTO email_list_contacts (list_id, user_id, email, first_name, last_name)
           SELECT $1::uuid, $2::uuid, e, fn, ln
           FROM UNNEST($3::text[], $4::text[], $5::text[]) AS t(e, fn, ln)
           ON CONFLICT (list_id, email) DO NOTHING`,
          [id, session.id, emails, firstNames, lastNames]
        )
        await pool.end()
      }
    }

    if (done) {
      await sql`
        UPDATE email_lists SET
          status = 'ready',
          total_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = ${id}),
          unverified_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = ${id} AND (verification_status IS NULL OR verification_status = 'unverified')),
          valid_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = ${id} AND verification_status = 'valid'),
          invalid_count = (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = ${id} AND verification_status = 'invalid'),
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
