import type { Metadata } from 'next'
import FeaturesContent from '@/components/marketing/features-content'

export const metadata: Metadata = {
  title: 'Features — NeuraMail',
  description: 'Everything you need for clean email lists and high-deliverability campaigns.',
}

export default function FeaturesEnPage() {
  return <FeaturesContent lang="en" />
}
