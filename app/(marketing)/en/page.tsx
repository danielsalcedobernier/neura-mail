import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import HomeContent from '@/components/marketing/home-content'

export default async function HomeEnPage() {
  const session = await getSession()
  if (session?.role === 'admin') redirect('/admin')
  else if (session) redirect('/dashboard')

  const rawPacks = await sql`
    SELECT id, name, credits, bonus_credits, price_usd
    FROM credit_packs WHERE is_active = true
    ORDER BY price_usd ASC LIMIT 3
  `
  const packs = rawPacks.map(p => ({
    id:            String(p.id),
    name:          String(p.name),
    credits:       Number(p.credits),
    bonus_credits: Number(p.bonus_credits),
    price_usd:     Number(p.price_usd),
  }))
  return <HomeContent lang="en" packs={packs} />
}
