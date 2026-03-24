import type { Metadata } from 'next'
import sql from '@/lib/db'
import PricingContent from '@/components/marketing/pricing-content'

export const metadata: Metadata = {
  title: 'Pricing — NeuraMail',
  description: 'Simple credit-based pricing. Buy once, use for verification and campaign sending. No subscriptions.',
}

export default async function PricingEnPage() {
  const packs = await sql`
    SELECT id, name, credits, bonus_credits, price_usd
    FROM credit_packs
    WHERE is_active = true
    ORDER BY price_usd ASC
  `
  return <PricingContent lang="en" packs={packs} />
}
