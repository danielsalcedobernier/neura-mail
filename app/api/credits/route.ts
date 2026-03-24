import { getSession, getUserCredits } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, unauthorized } from '@/lib/api'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const [balance, transactions] = await Promise.all([
    getUserCredits(session.id),
    sql`
      SELECT id, amount, type, description, balance_after, created_at
      FROM credit_transactions
      WHERE user_id = ${session.id}
      ORDER BY created_at DESC
      LIMIT 50
    `,
  ])

  return ok({ balance, transactions })
}
