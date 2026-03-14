import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, notFound, validationError } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  hostname: z.string().max(255).optional(),
  ip_address: z.string().max(45).optional(),
  monthly_price: z.number().min(0).optional(),
  status: z.enum(['available', 'provisioning', 'active', 'suspended', 'decommissioned']).optional(),
  user_id: z.string().uuid().nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return validationError('Invalid input', parsed.error.flatten())

    const d = parsed.data
    const rows = await sql`
      UPDATE dedicated_servers SET
        name = COALESCE(${d.name ?? null}, name),
        hostname = COALESCE(${d.hostname ?? null}, hostname),
        ip_address = COALESCE(${d.ip_address ?? null}, ip_address),
        monthly_price = COALESCE(${d.monthly_price ?? null}, monthly_price),
        status = COALESCE(${d.status ?? null}, status),
        user_id = CASE WHEN ${d.user_id !== undefined} THEN ${d.user_id ?? null} ELSE user_id END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    if (!rows[0]) return notFound('Server')
    return ok(rows[0])
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    return error('Failed to update server', 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    await sql`DELETE FROM dedicated_servers WHERE id = ${id}`
    return ok({ deleted: true })
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    return error('Failed to delete server', 500)
  }
}
