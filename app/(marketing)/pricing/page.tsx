import type { Metadata } from 'next'
import PricingContent from '@/components/marketing/pricing-content'

export const metadata: Metadata = {
  title: 'Precios — NeuraMail',
  description: 'Precios simples basados en créditos. Compra una vez, úsalos para verificación y envío de campañas. Sin suscripciones.',
}

export default function PricingPage() {
  return <PricingContent lang="es" />
}
