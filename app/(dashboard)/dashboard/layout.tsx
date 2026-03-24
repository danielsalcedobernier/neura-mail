import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Sidebar from '@/components/layout/sidebar'
import { Toaster } from '@/components/ui/sonner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role === 'admin') redirect('/admin')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={session.role as 'client'} userName={session.full_name ?? undefined} userEmail={session.email} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <Toaster />
    </div>
  )
}
