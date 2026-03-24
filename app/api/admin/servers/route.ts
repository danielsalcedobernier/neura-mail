import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, validationError, created } from '@/lib/api'

const schema = z.object({
  name: z.string().min(1).max(100),
  hostname: z.string().max(255).optional(),
  ip_address: z.string().max(45).optional(),
  monthly_price: z.number().min(0).default(0),
  status: z.enum(['available', 'provisioning', 'active', 'suspended', 'decommissioned']).default('available'),
})

export async function GET() {
  try {
    await requireAdmin()
    const rows = await sql`
      SELECT ds.*, u.email as user_email
      FROM dedicated_servers ds
      LEFT JOIN users u ON u.id = ds.user_id
      ORDER BY ds.created_at DESC
    `
    return ok(rows)
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    return error('Failed to load servers', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return validationError('Invalid input', parsed.error.flatten())

    const { name, hostname, ip_address, monthly_price, status } = parsed.data
    const rows = await sql`
      INSERT INTO dedicated_servers (name, hostname, ip_address, monthly_price, status)
      VALUES (${name}, ${hostname || null}, ${ip_address || null}, ${monthly_price}, ${status})
      RETURNING *
    `
    return created(rows[0])
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    console.error('[admin/servers POST]', err)
    return error('Failed to create server', 500)
  }
}
