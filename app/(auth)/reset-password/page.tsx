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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">NeuraMail</span>
          </div>
          <p className="text-sm text-muted-foreground">Set a new password</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          {done ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Password updated!</h3>
                <p className="text-sm text-muted-foreground">Redirecting you to login...</p>
              </div>
            </div>
          ) : invalid ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Invalid or expired link</h3>
                <p className="text-sm text-muted-foreground">This reset link is invalid or has expired. Please request a new one.</p>
              </div>
              <Link href="/forgot-password">
                <Button variant="outline" size="sm" className="mt-2">Request new link</Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="font-semibold text-foreground text-base">Create a new password</h2>
                <p className="text-sm text-muted-foreground mt-1">Must be at least 8 characters.</p>
              </div>
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="password" type="password" placeholder="••••••••" className="pl-9" {...register('password')} />
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="confirm" type="password" placeholder="••••••••" className="pl-9" {...register('confirm')} />
                  </div>
                  {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
                </div>

                <Button type="submit" disabled={loading} className="w-full mt-1">
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <>Update password <ArrowRight className="w-4 h-4 ml-1" /></>
                  }
                </Button>
              </form>
            </>
          )}
        </div>
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
