'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, ArrowRight, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const schema = z.object({
  password: z.string().min(8, 'At least 8 characters'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, {
  message: "Passwords don't match",
  path: ['confirm'],
})
type FormData = z.infer<typeof schema>

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')

  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [invalid, setInvalid] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!token) setInvalid(true)
  }, [token])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 400) setInvalid(true)
        toast.error(json.error || 'Reset failed')
        return
      }
      setDone(true)
      setTimeout(() => router.push('/login'), 3000)
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
          <p className="mt-1 text-sm text-muted-foreground">Set a new password</p>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h2 className="text-lg font-semibold">Password updated!</h2>
            <p className="text-sm text-muted-foreground">Redirecting you to login...</p>
          </div>
        ) : invalid ? (
          <div className="space-y-4 text-center">
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Invalid or expired link</h2>
            <p className="text-sm text-muted-foreground">This reset link is invalid or has expired. Please request a new one.</p>
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request new link</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Create a new password</h2>
              <p className="text-sm text-muted-foreground">Must be at least 8 characters.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" type="password" className="pl-9" placeholder="Minimum 8 characters" {...register('password')} />
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="confirm" type="password" className="pl-9" placeholder="Repeat your password" {...register('confirm')} />
                </div>
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Update password <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
