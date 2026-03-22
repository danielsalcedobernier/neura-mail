import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.isAdmin) return unauthorized()

  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') ?? ''

    const lists = search
      ? await sql`
          SELECT
            el.id, el.name, el.type,
            el.valid_count, el.invalid_count, el.unverified_count,
            el.verified_at, el.created_at,
            u.email AS user_email, u.full_name AS user_name,
            (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = el.id) AS total_contacts,
            (SELECT id FROM verification_jobs WHERE list_id = el.id AND status = 'completed' ORDER BY created_at DESC LIMIT 1) AS completed_job_id
          FROM email_lists el
          JOIN users u ON u.id = el.user_id
          WHERE el.name ILIKE ${'%' + search + '%'} OR u.email ILIKE ${'%' + search + '%'}
          ORDER BY el.created_at DESC LIMIT 200`
      : await sql`
          SELECT
            el.id, el.name, el.type,
            el.valid_count, el.invalid_count, el.unverified_count,
            el.verified_at, el.created_at,
            u.email AS user_email, u.full_name AS user_name,
            (SELECT COUNT(*) FROM email_list_contacts WHERE list_id = el.id) AS total_contacts,
            (SELECT id FROM verification_jobs WHERE list_id = el.id AND status = 'completed' ORDER BY created_at DESC LIMIT 1) AS completed_job_id
          FROM email_lists el
          JOIN users u ON u.id = el.user_id
          ORDER BY el.created_at DESC LIMIT 200`

    return ok(lists)
  } catch (e) {
    return serverError(e)
  }
}
