import { redirect } from 'next/navigation'
import sql from '@/lib/db'
import { Mail, CheckCircle } from 'lucide-react'

interface Props {
  searchParams: Promise<{ email?: string; campaign?: string }>
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const { email, campaign } = await searchParams

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-muted-foreground">Invalid unsubscribe link.</p>
        </div>
      </div>
    )
  }

  // Record unsubscribe
  let userId: string | null = null
  if (campaign) {
    const camp = await sql`SELECT user_id FROM campaigns WHERE id = ${campaign}`
    userId = camp[0]?.user_id || null
  }

  await sql`
    INSERT INTO unsubscribes (email, user_id, campaign_id, reason)
    VALUES (${email.toLowerCase()}, ${userId}, ${campaign || null}, 'unsubscribe_link')
    ON CONFLICT (email, user_id) DO NOTHING
  `

  // Also mark the contact as unsubscribed
  if (userId) {
    await sql`
      UPDATE email_list_contacts SET is_unsubscribed = true, unsubscribed_at = NOW()
      WHERE email = ${email.toLowerCase()} AND user_id = ${userId}
    `
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Mail className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold text-foreground">NeuraMail</span>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">You&apos;ve been unsubscribed</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{email}</span> has been removed from this mailing list.
            You will no longer receive emails from this sender.
          </p>
        </div>
      </div>
    </div>
  )
}
