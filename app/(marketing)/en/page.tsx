import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import HomeContent from '@/components/marketing/home-content'

export default async function HomeEnPage() {
  const session = await getSession()
  if (session?.role === 'admin') redirect('/admin')
  else if (session) redirect('/dashboard')
  return <HomeContent lang="en" />
}
