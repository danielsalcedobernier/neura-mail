'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const schema = z.object({
  email: z.string().email('Invalid email address'),
})
type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, getValues, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Something went wrong')
        return
      }
      setSent(true)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">NeuraMail</h1>
          <p className="mt-1 text-sm text-muted-foreground">Password recovery</p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h2 className="text-lg font-semibold text-foreground">Check your inbox</h2>
            <p className="text-sm text-muted-foreground">
              If an account exists for {getValues('email')}, we sent a password reset link. It expires in 1 hour.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" />Back to login</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Forgot your password?</h2>
              <p className="text-sm text-muted-foreground">
                {"Enter your email address and we'll send you a link to reset your password."}
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" className="pl-9" placeholder="you@example.com" {...register('email')} />
                </div>
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send reset link <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </form>
          </>
        )}

        {!sent && (
          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{' '}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  )
}
