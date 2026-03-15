import type { Metadata } from 'next'
import Navbar from '@/components/marketing/navbar'
import Footer from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'NeuraMail — Email Verification & Campaign Platform',
  description: 'Verify email lists at scale, send campaigns, and grow your deliverability with AI-powered tools.',
}

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar lang="en" />
      <div className="flex-1">{children}</div>
      <Footer lang="en" />
    </div>
  )
}
