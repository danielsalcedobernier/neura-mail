'use client'

import useSWR, { mutate } from 'swr'
import { CreditCard, Zap, ArrowUpCircle, ArrowDownCircle, Loader2, PackageOpen, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const FALLBACK_PACKAGES = [
  { id: 'starter', label: '5,000 Credits', credits: 5000, price_usd: 9, bonus_credits: 0, popular: false },
  { id: 'growth', label: '25,000 Credits', credits: 25000, price_usd: 35, bonus_credits: 0, popular: true },
  { id: 'pro', label: '100,000 Credits', credits: 100000, price_usd: 100, bonus_credits: 0, popular: false },
  { id: 'scale', label: '500,000 Credits', credits: 500000, price_usd: 400, bonus_credits: 0, popular: false },
]

export default function CreditsPage() {
  const { data: credits } = useSWR('/api/credits', fetcher, { refreshInterval: 8000 })
  const { data: packs } = useSWR('/api/credits/packs', fetcher)
  const packages = packs?.length ? packs : FALLBACK_PACKAGES
  const [buying, setBuying] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const capturePayment = useCallback(async (orderId: string) => {
    const res = await fetch('/api/credits/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const json = await res.json()
    if (json.success) {
      toast.success(`${json.data.creditsAdded.toLocaleString()} credits added to your balance!`)
      mutate('/api/credits')
    } else {
      toast.error(json.error || 'Payment capture failed')
    }
  }, [])

  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    const token = searchParams.get('token') // PayPal order ID
    if (paymentStatus === 'success' && token) {
      capturePayment(token)
    } else if (paymentStatus === 'cancelled') {
      toast.info('Payment cancelled.')
    }
  }, [searchParams, capturePayment])

  const buyCredits = async (pkg: Record<string, unknown>) => {
    const pkgId = String(pkg.id)
    setBuying(pkgId)
    // Use plan_id if it looks like a UUID (DB pack), otherwise send credit_package
    const isUuid = /^[0-9a-f-]{36}$/i.test(pkgId)
    const body = isUuid
      ? { plan_id: pkgId }
      : { credit_package: { credits: Number(pkg.credits), price_usd: Number(pkg.price_usd), label: String(pkg.label || pkg.name) } }
    try {
      const res = await fetch('/api/credits/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to initialize payment'); return }
      if (json.data?.approveUrl) {
        window.location.href = json.data.approveUrl
      }
    } catch { toast.error('Payment initialization failed') }
    finally { setBuying(null) }
  }



  const txIcon = (type: string) => {
    if (['credit_purchase', 'plan_purchase', 'admin_grant', 'bonus'].includes(type)) {
      return <ArrowUpCircle className="w-4 h-4 text-green-500" />
    }
    return <ArrowDownCircle className="w-4 h-4 text-destructive" />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Créditos de verificación</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Los créditos se consumen al verificar emails. Los hits de caché son siempre gratis.</p>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="col-span-1 bg-primary/5 border-primary/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo disponible</p>
              <p className="text-3xl font-bold text-foreground">{Number(credits?.balance ?? 0).toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">créditos de verificación</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Costo por 1.000 verificaciones</p>
            <p className="text-xl font-semibold text-foreground">$1.00 – $1.80</p>
            <p className="text-xs text-muted-foreground mt-0.5">Hits de caché son gratis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Método de pago</p>
            <div className="flex items-center gap-2 mt-1">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">PayPal</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Pago seguro</p>
          </CardContent>
        </Card>
      </div>

      {/* Credit Packages */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-foreground mb-3">Comprar créditos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg: Record<string, unknown>) => {
            const totalCredits = Number(pkg.credits) + Number(pkg.bonus_credits || 0)
            const perk = totalCredits > 0 ? ((Number(pkg.price_usd) / totalCredits) * 1000).toFixed(2) : '?'
            const isPopular = Boolean(pkg.popular)
            const pkgId = String(pkg.id)
            return (
              <Card key={pkgId} className={`relative hover:border-primary/40 transition-colors ${isPopular ? 'border-primary/50 ring-1 ring-primary/20' : ''}`}>
                {isPopular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded-full font-medium">Más popular</span>
                  </div>
                )}
                <CardContent className="p-5 flex flex-col gap-3">
                  <div>
                    <p className="font-medium text-foreground">{pkg.name as string || pkg.label as string}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">${Number(pkg.price_usd).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">{totalCredits.toLocaleString('es-CL')} créditos</p>
                    {Number(pkg.bonus_credits) > 0 && (
                      <p className="text-xs text-green-600">+{Number(pkg.bonus_credits).toLocaleString('es-CL')} créditos extra</p>
                    )}
                    <p className="text-xs text-muted-foreground">${perk} por 1k verificaciones</p>
                  </div>
                  <Button
                    className="w-full"
                    size="sm"
                    variant={isPopular ? 'default' : 'outline'}
                    onClick={() => buyCredits(pkg as Parameters<typeof buyCredits>[0])}
                    disabled={buying !== null}
                  >
                    {buying === pkgId
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><ShoppingCart className="w-3.5 h-3.5 mr-1.5" /> Pagar con PayPal</>  
                    }
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Serás redirigido a PayPal para completar tu compra de forma segura.
          Los créditos se agregan inmediatamente tras confirmar el pago.
        </p>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Historial de transacciones</h2>
        <Card>
          {!credits?.transactions?.length ? (
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <PackageOpen className="w-8 h-8 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">Aún no hay transacciones.</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-border">
              {credits.transactions.map((tx: Record<string, unknown>) => (
                <div key={tx.id as string} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    {txIcon(tx.type as string)}
                    <div>
                      <p className="text-sm text-foreground">{tx.description as string || tx.type as string}</p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.created_at as string).toLocaleDateString('es-CL')} · saldo tras: {Number(tx.balance_after).toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-medium ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {Number(tx.amount) >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString()} credits
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
