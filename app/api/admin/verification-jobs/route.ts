import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ok, forbidden } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'completed'

  const rows = await sql`
    SELECT id, list_id, status, created_at
    FROM verification_jobs
    WHERE status = ${status}
    ORDER BY created_at DESC
  `
  return ok(rows)
}
