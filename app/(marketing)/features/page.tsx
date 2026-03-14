import type { Metadata } from 'next'
import FeaturesContent from '@/components/marketing/features-content'

export const metadata: Metadata = {
  title: 'Funciones — NeuraMail',
  description: 'Todo lo que necesitas para listas de email limpias y campañas de alta entregabilidad.',
}

export default function FeaturesPage() {
  return <FeaturesContent lang="es" />
}
