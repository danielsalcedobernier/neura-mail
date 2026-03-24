'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Mail, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

function VerifyEmailContent() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('No verification token provided.')
      return
    }
    fetch(`/api/auth/verify-email?token=${token}`)
      .then(r => r.json())
      .then(json => {
        if (json.data?.verified) {
          setStatus('success')
          setTimeout(() => router.push('/login'), 3000)
        } else {
          setStatus('error')
          setMessage(json.error || 'Verification failed. The link may have expired.')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('Network error. Please try again.')
      })
  }, [token, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">NeuraMail</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-sm flex flex-col items-center gap-5 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">Verifying your email...</h3>
                <p className="text-sm text-muted-foreground">Please wait a moment.</p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg mb-1">Email verified!</h3>
                <p className="text-sm text-muted-foreground">Your account is now active. Redirecting to login...</p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg mb-1">Verification failed</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
              </div>
              <Link href="/login">
                <Button variant="outline" size="sm">Go to login</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  )
}
