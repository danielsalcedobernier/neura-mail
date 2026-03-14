import type { Metadata } from 'next'
import DocsContent from '@/components/marketing/docs-content'

export const metadata: Metadata = {
  title: 'API Documentation — NeuraMail',
  description: 'Integrate email verification into your product with the NeuraMail REST API.',
}

export default function DocsEnPage() {
  return <DocsContent lang="en" />
}
