import Navbar from '@/components/marketing/navbar'
import Footer from '@/components/marketing/footer'

export default function EsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar lang="es" />
      <main className="flex-1">{children}</main>
      <Footer lang="es" />
    </div>
  )
}
