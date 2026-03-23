import type { Metadata } from 'next'
import sql from '@/lib/db'
import PricingContent from '@/components/marketing/pricing-content'
import EsLayout from '@/components/marketing/es-layout'

// Esta línea es el "salvavidas" para el deploy en Coolify
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Precios — NeuraMail',
  description: 'Precios simples basados en créditos. Compra una vez, úsalos para verificación y envío de campañas. Sin suscripciones.',
}

export default async function PricingPage() {
  // Gracias al ajuste que haremos en lib/db.ts, esto seguirá funcionando igual
  const packs = await sql`
    SELECT id, name, credits, bonus_credits, price_usd
    FROM credit_packs
    WHERE is_active = true
    ORDER BY price_usd ASC
  `
  return <EsLayout><PricingContent lang="es" packs={packs} /></EsLayout>
}
