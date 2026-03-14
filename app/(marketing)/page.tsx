import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import HomeContent from '@/components/marketing/home-content'
import EsLayout from '@/components/marketing/es-layout'

export default async function HomePage() {
  const session = await getSession()
  if (session?.role === 'admin') redirect('/admin')
  else if (session) redirect('/dashboard')

  const packs = await sql`
    SELECT id, name, credits, bonus_credits, price_usd
    FROM credit_packs WHERE is_active = true
    ORDER BY price_usd ASC LIMIT 3
  `
  return <EsLayout><HomeContent lang="es" packs={packs} /></EsLayout>
}
