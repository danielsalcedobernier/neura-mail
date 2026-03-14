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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">NeuraMail</span>
          </div>
          <p className="text-sm text-muted-foreground">Password recovery</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Check your inbox</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  If an account exists for <span className="text-foreground font-medium">{getValues('email')}</span>, we sent a password reset link. It expires in 1 hour.
                </p>
              </div>
              <Link href="/login">
                <Button variant="outline" size="sm" className="mt-2">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="font-semibold text-foreground text-base">Forgot your password?</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Enter your email address and we&apos;ll send you a link to reset your password.
                </p>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      className="pl-9"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <Button type="submit" disabled={loading} className="w-full mt-1">
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <>Send reset link <ArrowRight className="w-4 h-4 ml-1" /></>
                  }
                </Button>
              </form>
            </>
          )}
        </div>

        {!sent && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            Remember your password?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  )
}
