import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, error, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()
  try {
    const rows = await sql`
      SELECT id, created_at, file_name, email_count, mailsso_batch_id,
        status, result_count, result_summary, error_message, fetched_at, saved_at
      FROM admin_cache_batches
      ORDER BY created_at DESC
      LIMIT 100
    `
    return ok(rows)
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()
  try {
    const body = await req.json()
    const { emails, fileName, pending } = body as { emails: string[]; fileName: string; pending?: boolean }
    if (!Array.isArray(emails) || emails.length === 0) return error('emails[] required', 400)
    if (emails.length > 50000) return error('Max 50,000 emails per batch', 400)
    const normalized = emails.map(e => e.toLowerCase().trim()).filter(e => e.includes('@'))

    if (pending) {
      const rows = await sql`
        INSERT INTO admin_cache_batches (file_name, email_count, mailsso_batch_id, status)
        VALUES (${fileName ?? 'unknown'}, ${normalized.length}, NULL, 'pending_submission')
        RETURNING id, mailsso_batch_id, email_count, status, created_at
      `
      return ok(rows[0])
    }

    // Placeholder: no mailsso lib in this env, just record as pending
    const rows = await sql`
      INSERT INTO admin_cache_batches (file_name, email_count, mailsso_batch_id, status)
      VALUES (${fileName ?? 'unknown'}, ${normalized.length}, NULL, 'pending_submission')
      RETURNING id, mailsso_batch_id, email_count, status, created_at
    `
    return ok(rows[0])
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
