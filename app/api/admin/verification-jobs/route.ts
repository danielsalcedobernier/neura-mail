import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.isAdmin) return unauthorized()

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
