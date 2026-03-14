import type { Metadata } from 'next'
import PricingContent from '@/components/marketing/pricing-content'

export const metadata: Metadata = {
  title: 'Pricing — NeuraMail',
  description: 'Simple credit-based pricing. Buy once, use for verification and campaign sending. No subscriptions.',
}

export default function PricingEnPage() {
  return <PricingContent lang="en" />
}
