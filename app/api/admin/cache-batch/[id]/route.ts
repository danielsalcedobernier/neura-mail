import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, notFound, serverError } from '@/lib/api'
import sql from '@/lib/db'
import { pollBatch, storeBatchInCache, submitBatch } from '@/lib/mailsso'

const MAX_CONCURRENT = 2

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

    // ── Auto-dispatch next pending batch if a slot opened up ─────────────────
    let dispatched = null
    try {
      const activeRows = await sql`
        SELECT COUNT(*) AS cnt FROM admin_cache_batches WHERE status = 'submitted'
      `
      const active = Number(activeRows[0]?.cnt ?? 0)
      if (active < MAX_CONCURRENT) {
        // Pick oldest pending batch and submit it
        const pending = await sql`
          SELECT id, file_name, email_count FROM admin_cache_batches
          WHERE status = 'pending_submission'
          ORDER BY created_at ASC
          LIMIT 1
        `
        if (pending[0]) {
          // We need the emails — but they're not stored, only the count.
          // Mark as 'needs_resubmit' so the admin can see it needs attention.
          // Since emails aren't stored (only email_count), flag it for manual re-upload.
          await sql`
            UPDATE admin_cache_batches SET status = 'needs_resubmit' WHERE id = ${pending[0].id}
          `
          dispatched = { id: pending[0].id, note: 'needs_resubmit' }
        }
      }
    } catch { /* non-critical */ }

    return ok({ ready: true, result_count: results.length, summary, dispatched })
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
