'use client'

import useSWR from 'swr'
import { CreditCard, Zap, TrendingUp, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

export default function CreditsPage() {
  const { data: credits } = useSWR('/api/credits', fetcher)
  const { data: packs } = useSWR('/api/credits/packs', fetcher)
  const { data: history } = useSWR('/api/credits/history', fetcher)
  const [buyingPack, setBuyingPack] = useState<string | null>(null)

  const buyPack = async (packId: string) => {
    setBuyingPack(packId)
    try {
      const res = await fetch('/api/payments/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'credits', credit_pack_id: packId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Payment failed'); return }
      // Redirect to PayPal approval URL
      if (json.data?.approve_url) {
        window.location.href = json.data.approve_url
      }
    } catch { toast.error('Payment initialization failed') }
    finally { setBuyingPack(null) }
  }

  const txIcon = (type: string) => {
    if (type === 'purchase' || type === 'bonus') return <ArrowUpCircle className="w-4 h-4 text-green-500" />
    return <ArrowDownCircle className="w-4 h-4 text-destructive" />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Verification Credits</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Credits are used for email verification. Cache hits are always free.</p>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="col-span-1 bg-primary/5 border-primary/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className="text-3xl font-bold text-foreground">{Number(credits?.balance ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">credits</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Total Purchased</p>
            <p className="text-2xl font-semibold text-foreground">{Number(credits?.total_purchased ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Total Used</p>
            <p className="text-2xl font-semibold text-foreground">{Number(credits?.total_used ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Credit Packs */}
      <div className="mb-8">
        <h2 className="text-base font-medium text-foreground mb-3">Buy Credits</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(packs || []).map((pack: Record<string, unknown>) => {
            const totalCredits = Number(pack.credits) + Number(pack.bonus_credits)
            return (
              <Card key={pack.id as string} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-foreground">{pack.name as string}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{Number(pack.credits).toLocaleString()}</p>
                      {Number(pack.bonus_credits) > 0 && (
                        <p className="text-xs text-green-600">+ {Number(pack.bonus_credits).toLocaleString()} bonus</p>
                      )}
                      <p className="text-xs text-muted-foreground">{totalCredits.toLocaleString()} total credits</p>
                    </div>
                    <p className="text-xl font-bold text-foreground">${Number(pack.price_usd).toFixed(2)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    ${(Number(pack.price_usd) / totalCredits * 1000).toFixed(2)} per 1,000 verifications
                  </p>
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={() => buyPack(pack.id as string)}
                    disabled={buyingPack === pack.id as string}
                  >
                    {buyingPack === pack.id as string ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-1.5" />
                    )}
                    Buy with PayPal
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-base font-medium text-foreground mb-3">Transaction History</h2>
        <Card>
          {!history?.length ? (
            <CardContent className="flex items-center justify-center py-10">
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            </CardContent>
          ) : (
            <div className="divide-y divide-border">
              {history.map((tx: Record<string, unknown>) => (
                <div key={tx.id as string} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    {txIcon(tx.type as string)}
                    <div>
                      <p className="text-sm text-foreground">{tx.description as string || tx.type as string}</p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.created_at as string).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {Number(tx.amount) >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Balance: {Number(tx.balance_after).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
