import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`SELECT * FROM campaigns WHERE id = ${id} AND user_id = ${session.id}`
  if (!rows[0]) return notFound('Campaign')
  if (rows[0].status !== 'paused') return error('Only paused campaigns can be resumed', 400)

  await sql`UPDATE campaigns SET status = 'running', updated_at = NOW() WHERE id = ${id}`
  await sql`UPDATE sending_queue SET status = 'pending' WHERE campaign_id = ${id} AND status = 'paused'`

  return ok({ resumed: true })
}
