import type { Metadata } from 'next'
import DocsContent from '@/components/marketing/docs-content'

export const metadata: Metadata = {
  title: 'Documentación API — NeuraMail',
  description: 'Integra la verificación de emails en tu producto con la API REST de NeuraMail.',
}

export default function DocsPage() {
  return <DocsContent lang="es" />
}
