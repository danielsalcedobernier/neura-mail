import type { Metadata } from 'next'
import sql from '@/lib/db'
import PricingContent from '@/components/marketing/pricing-content'
import EsLayout from '@/components/marketing/es-layout'

export const metadata: Metadata = {
  title: 'Precios — NeuraMail',
  description: 'Precios simples basados en créditos. Compra una vez, úsalos para verificación y envío de campañas. Sin suscripciones.',
}

export default async function PricingPage() {
  const packs = await sql`
    SELECT id, name, credits, bonus_credits, price_usd
    FROM credit_packs
    WHERE is_active = true
    ORDER BY price_usd ASC
  `
  return <EsLayout><PricingContent lang="es" packs={packs} /></EsLayout>
}
