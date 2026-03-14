import type { Metadata } from 'next'
import Navbar from '@/components/marketing/navbar'
import Footer from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'NeuraMail — Verificación de Email y Plataforma de Campañas',
  description: 'Verifica listas de email a escala, envía campañas y mejora tu entregabilidad con herramientas potenciadas por IA.',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar lang="es" />
      <main className="flex-1">{children}</main>
      <Footer lang="es" />
    </div>
  )
}
