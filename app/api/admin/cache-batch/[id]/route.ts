import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, notFound, serverError } from '@/lib/api'
import sql from '@/lib/db'
import { pollBatch, storeBatchInCache } from '@/lib/mailsso'

/**
 * POST /api/admin/cache-batch/[id]
 * Queries mails.so for the batch result.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()

  const { id } = await params

  try {
    const rows = await sql`
      SELECT id, mailsso_batch_id, status, email_count
      FROM admin_cache_batches
      WHERE id = ${id}
    `
    if (!rows[0]) return notFound('Batch')

    const batch = rows[0]

    // Already saved — nothing to do
    if (batch.status === 'saved') {
      return ok({ ready: true, already_saved: true, result_count: batch.email_count })
    }

    if (!batch.mailsso_batch_id) {
      return ok({ ready: false, reason: 'No mails.so batch ID recorded' })
    }

    // Poll mails.so
    const results = await pollBatch(batch.mailsso_batch_id as string)

    if (results === null) {
      // Mark as ready for UI to show "still processing"
      await sql`
        UPDATE admin_cache_batches SET status = 'submitted', fetched_at = NOW()
        WHERE id = ${id}
      `
      return ok({ ready: false })
    }

    // Compute breakdown summary
    const summary = {
      total:       results.length,
      valid:       results.filter(r => r.status === 'valid').length,
      invalid:     results.filter(r => r.status === 'invalid').length,
      risky:       results.filter(r => r.status === 'risky').length,
      catch_all:   results.filter(r => r.status === 'catch_all').length,
      unknown:     results.filter(r => r.status === 'unknown').length,
      disposable:  results.filter(r => r.is_disposable).length,
      role_based:  results.filter(r => r.is_role_based).length,
    }

    // Save to cache
    await storeBatchInCache(results, session.id)

    await sql`
      UPDATE admin_cache_batches
      SET status         = 'saved',
          result_count   = ${results.length},
          result_summary = ${JSON.stringify(summary)}::jsonb,
          fetched_at     = NOW(),
          saved_at       = NOW()
      WHERE id = ${id}
    `

    return ok({ ready: true, result_count: results.length, summary })
  } catch (e: unknown) {
    // Persist error on the batch record
    await sql`
      UPDATE admin_cache_batches
      SET status = 'error', error_message = ${(e as Error).message}
      WHERE id = ${id}
    `.catch(() => null)

    return serverError((e as Error).message)
  }
}

/**
 * DELETE /api/admin/cache-batch/[id]
 * Deletes a batch record so it can be re-submitted if mails.so failed.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()

  const { id } = await params

  try {
    const rows = await sql`
      DELETE FROM admin_cache_batches WHERE id = ${id} RETURNING id
    `
    if (!rows[0]) return notFound('Batch')
    return ok({ deleted: true, id })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
