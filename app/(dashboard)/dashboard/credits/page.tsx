'use client'

import useSWR, { mutate } from 'swr'
import { CreditCard, ArrowUpCircle, ArrowDownCircle, Loader2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const FALLBACK_PACKAGES = [
  { id: 'starter', label: '5,000 Credits', credits: 5000, price_usd: 9, bonus_credits: 0, popular: false },
  { id: 'growth', label: '25,000 Credits', credits: 25000, price_usd: 35, bonus_credits: 0, popular: true },
  { id: 'pro', label: '100,000 Credits', credits: 100000, price_usd: 100, bonus_credits: 0, popular: false },
  { id: 'scale', label: '500,000 Credits', credits: 500000, price_usd: 400, bonus_credits: 0, popular: false },
]

function CreditsContent() {
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
      toast.success(`${json.data.creditsAdded.toLocaleString()} credits added!`)
      mutate('/api/credits')
    } else {
      toast.error(json.error || 'Payment capture failed')
    }
  }, [])

  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    const token = searchParams.get('token')
    if (paymentStatus === 'success' && token) capturePayment(token)
    else if (paymentStatus === 'cancelled') toast.info('Payment cancelled.')
  }, [searchParams, capturePayment])

  const buyCredits = async (pkg: Record<string, unknown>) => {
    const pkgId = String(pkg.id)
    setBuying(pkgId)
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
      if (json.data?.approveUrl) window.location.href = json.data.approveUrl
    } catch { toast.error('Payment initialization failed') }
    finally { setBuying(null) }
  }

  const txIcon = (type: string) => {
    if (['credit_purchase', 'plan_purchase', 'admin_grant', 'bonus'].includes(type)) {
      return <ArrowUpCircle className="h-4 w-4 text-green-500 shrink-0" />
    }
    return <ArrowDownCircle className="h-4 w-4 text-destructive shrink-0" />
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Créditos de verificación</h1>
        <p className="text-muted-foreground text-sm mt-1">Los créditos se consumen al verificar emails (1 crédito por email).</p>
      </div>

      {/* Balance overview */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="pt-6 pb-5 flex items-center gap-5">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">{Number(credits?.balance ?? 0).toLocaleString('es-CL')}</div>
              <div className="text-sm text-muted-foreground">créditos disponibles</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5 space-y-1">
            <div className="text-xs text-muted-foreground">Costo por 1.000 verificaciones</div>
            <div className="text-lg font-semibold text-foreground">$1.00 – $1.80</div>
            <div className="text-xs text-muted-foreground">Según el volumen</div>
            <div className="text-xs text-muted-foreground mt-2">Método: PayPal (pago seguro)</div>
          </CardContent>
        </Card>
      </div>

      {/* Credit packages */}
      <div>
        <h2 className="text-base font-semibold mb-4 text-foreground">Comprar créditos</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg: Record<string, unknown>) => {
            const totalCredits = Number(pkg.credits) + Number(pkg.bonus_credits || 0)
            const perk = totalCredits > 0 ? ((Number(pkg.price_usd) / totalCredits) * 1000).toFixed(2) : '?'
            const isPopular = Boolean(pkg.popular)
            const pkgId = String(pkg.id)
            return (
              <Card key={pkgId} className={isPopular ? 'border-primary ring-1 ring-primary' : ''}>
                <CardContent className="pt-5 pb-5 space-y-3 relative">
                  {isPopular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs">
                      Más popular
                    </Badge>
                  )}
                  <div>
                    <div className="font-semibold text-sm text-foreground">{pkg.name as string || pkg.label as string}</div>
                    <div className="text-2xl font-bold text-foreground">${Number(pkg.price_usd).toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">{totalCredits.toLocaleString('es-CL')} créditos</div>
                    {Number(pkg.bonus_credits) > 0 && (
                      <div className="text-xs text-green-600">+{Number(pkg.bonus_credits).toLocaleString('es-CL')} extra</div>
                    )}
                    <div className="text-xs text-muted-foreground">${perk} por 1k verif.</div>
                  </div>
                  <Button
                    onClick={() => buyCredits(pkg)}
                    disabled={buying !== null}
                    className="w-full"
                    size="sm"
                    variant={isPopular ? 'default' : 'outline'}
                  >
                    {buying === pkgId ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingCart className="h-3 w-3 mr-1.5" />Pagar con PayPal</>}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Serás redirigido a PayPal para completar tu compra de forma segura. Los créditos se agregan inmediatamente.
        </p>
      </div>

      {/* Transaction history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Historial de transacciones</CardTitle>
        </CardHeader>
        <CardContent>
          {!credits?.transactions?.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Aún no hay transacciones.</div>
          ) : (
            <div className="space-y-2">
              {credits.transactions.map((tx: Record<string, unknown>) => (
                <div key={tx.id as string} className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {txIcon(tx.type as string)}
                    <div className="min-w-0">
                      <div className="text-sm truncate">{tx.description as string || tx.type as string}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.created_at as string).toLocaleDateString('es-CL')} · saldo: {Number(tx.balance_after).toLocaleString('es-CL')}
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-medium shrink-0 ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {Number(tx.amount) >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <CreditsContent />
    </Suspense>
  )
}
