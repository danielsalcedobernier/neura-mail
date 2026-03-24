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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">NeuraMail</h1>
        </div>

        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h2 className="text-lg font-semibold">Verifying your email...</h2>
            <p className="text-sm text-muted-foreground">Please wait a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h2 className="text-lg font-semibold">Email verified!</h2>
            <p className="text-sm text-muted-foreground">Your account is now active. Redirecting to login...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Verification failed</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild className="w-full">
              <Link href="/login">Go to login</Link>
            </Button>
          </>
        )}
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
