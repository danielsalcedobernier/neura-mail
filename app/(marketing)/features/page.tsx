import type { Metadata } from 'next'
import FeaturesContent from '@/components/marketing/features-content'
import EsLayout from '@/components/marketing/es-layout'

export const metadata: Metadata = {
  title: 'Funciones — NeuraMail',
  description: 'Todo lo que necesitas para listas de email limpias y campañas de alta entregabilidad.',
}

export default function FeaturesPage() {
  return <EsLayout><FeaturesContent lang="es" /></EsLayout>
}
