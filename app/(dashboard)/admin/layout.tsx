import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Sidebar from '@/components/layout/sidebar'
import { Toaster } from '@/components/ui/sonner'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'admin' && session.role !== 'worker') redirect('/dashboard')

  // Worker route protection is handled in middleware.ts
  const sidebarRole = session.role === 'worker' ? 'worker' : 'admin'

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar role={sidebarRole} userName={session.full_name || session.email} userEmail={session.email} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <Toaster richColors position="top-right" />
    </div>
  )
}
