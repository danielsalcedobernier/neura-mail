import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import HomeContent from '@/components/marketing/home-content'
import EsLayout from '@/components/marketing/es-layout'

export default async function HomePage() {
  const session = await getSession()
  if (session?.role === 'admin') redirect('/admin')
  else if (session) redirect('/dashboard')
  return <EsLayout><HomeContent lang="es" /></EsLayout>
}
