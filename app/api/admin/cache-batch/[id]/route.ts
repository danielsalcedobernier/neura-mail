import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, notFound, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()
  const { id } = await params
  try {
    const rows = await sql`SELECT id, mailsso_batch_id, status, email_count FROM admin_cache_batches WHERE id = ${id}`
    if (!rows[0]) return notFound('Batch')
    const batch = rows[0]
    if (batch.status === 'saved') return ok({ ready: true, already_saved: true, result_count: batch.email_count })
    return ok({ ready: false, reason: 'Batch not yet processed' })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || session.role !== 'admin') return unauthorized()
  const { id } = await params
  try {
    const rows = await sql`DELETE FROM admin_cache_batches WHERE id = ${id} RETURNING id`
    if (!rows[0]) return notFound('Batch')
    return ok({ deleted: true, id })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
