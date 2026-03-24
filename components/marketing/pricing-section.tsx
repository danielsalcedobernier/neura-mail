'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle2, Zap } from 'lucide-react'
import type { Lang } from '@/i18n/translations'
import { t } from '@/i18n/translations'

interface CreditPack {
  id: string
  name: string
  credits: number
  bonus_credits: number
  price_usd: number
}

export default function PricingSection({ lang, packs }: { lang: Lang; packs: CreditPack[] }) {
  const tr = t[lang].home
  const base = lang === 'en' ? '/en' : ''

  return (
    <section className="py-24 px-6 border-t border-white/10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14 flex flex-col gap-3">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">
            {lang === 'es' ? 'Pago por uso' : 'Pay as you go'}
          </p>
          <h2 className="text-4xl font-bold text-white text-balance">{tr.pricingTitle}</h2>
          <p className="text-white/40 max-w-md mx-auto text-pretty leading-relaxed">{tr.pricingSub}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {packs.map((pack, i) => {
            const credits     = Number(pack.credits)
            const bonus       = Number(pack.bonus_credits)
            const price       = Number(pack.price_usd)
            const totalCredits = credits + bonus
            const perK        = totalCredits > 0 ? ((price / totalCredits) * 1000).toFixed(2) : '?'
            const isPopular   = i === 1
            const creditsLabel = credits.toLocaleString('en-US').replace(/,/g, lang === 'es' ? '.' : ',')

            return (
              <div
                key={pack.id}
                className={`relative rounded-xl border p-7 flex flex-col gap-6 ${
                  isPopular ? 'border-primary/60 bg-primary/5' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-xs px-3 py-1 bg-primary text-white rounded-full font-medium">
                      {tr.popularLabel}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-white/50 font-medium">{pack.name}</p>
                  <p className="text-4xl font-bold text-white">${price}</p>
                  <p className="text-sm text-white/40">{creditsLabel} {lang === 'es' ? 'créditos' : 'credits'}</p>
                  {bonus > 0 && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      +{bonus.toLocaleString('en-US')} {lang === 'es' ? 'créditos bonus' : 'bonus credits'}
                    </p>
                  )}
                  <p className="text-xs text-white/20">${perK} {lang === 'es' ? 'por 1.000' : 'per 1,000'}</p>
                </div>
                <ul className="flex flex-col gap-2.5 flex-1">
                  {[
                    lang === 'es' ? 'Verificación masiva' : 'Bulk verification',
                    lang === 'es' ? 'Envío de campañas' : 'Campaign sending',
                    lang === 'es' ? 'Exportar CSV' : 'CSV export',
                    lang === 'es' ? 'Acceso API REST' : 'REST API access',
                  ].map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                      <CheckCircle2 className="w-4 h-4 text-primary/70 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
                <Link href="/register">
                  <Button
                    size="sm"
                    className={`w-full ${isPopular ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                  >
                    {lang === 'es' ? 'Empezar' : 'Get started'} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            )
          })}
        </div>
        <p className="text-center text-sm text-white/30 mt-8">
          {tr.pricingNote}{' '}
          <Link href={`${base}/pricing`} className="text-primary hover:underline">{tr.pricingNoteLink}</Link>
          {' '}{tr.pricingNoteOr}
        </p>
      </div>
    </section>
  )
}
