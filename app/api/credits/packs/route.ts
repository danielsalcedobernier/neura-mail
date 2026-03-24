import sql from '@/lib/db'
import { ok } from '@/lib/api'

export async function GET() {
  const packs = await sql`
    SELECT id, name, credits, bonus_credits, price_usd, sort_order
    FROM credit_packs
    WHERE is_active = true
    ORDER BY sort_order ASC, price_usd ASC
  `
  return ok(packs)
}
