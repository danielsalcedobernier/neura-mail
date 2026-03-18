'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowRight, CheckCircle2, Zap, Shield, BarChart3,
  Send, Key, TrendingUp, Clock, Globe,
} from 'lucide-react'
import type { Lang } from '@/i18n/translations'
import { t } from '@/i18n/translations'

interface CreditPack {
  id: string
  name: string
  credits: number | string
  bonus_credits: number | string
  price_usd: number | string
}

const ICONS = [Shield, Send, Zap, Key, BarChart3, Globe]
const STATS_VALUES = ['99.8%', '< 200ms', '50M+', '99.9%']

export default function HomeContent({ lang, packs = [] }: { lang: Lang; packs?: CreditPack[] }) {
  const tr = t[lang].home
  const base = lang === 'en' ? '/en' : ''
  // Defer rendering of dynamic data-driven sections to avoid SSR/client hydration mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      {/* HERO */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-6 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/10 blur-[120px]" />

        <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/60">
            <TrendingUp className="w-3 h-3 text-primary" />
            {tr.badge}
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white text-balance leading-[1.08] tracking-tight">
            {tr.h1a}<br />
            <span className="text-primary">{tr.h1b}</span>
          </h1>

          <p className="text-lg text-white/50 max-w-xl leading-relaxed text-pretty">{tr.sub}</p>

          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Link href="/register">
              <Button size="lg" className="bg-white text-black hover:bg-white/90 font-semibold px-7 gap-2">
                {tr.ctaPrimary} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href={`${base}/pricing`}>
              <Button size="lg" className="bg-transparent border border-white/25 text-white hover:bg-white/10 hover:text-white px-7">
                {tr.ctaSecondary}
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4">
            {tr.proof.map(text => (
              <span key={text} className="flex items-center gap-1.5 text-xs text-white/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary/70" />{text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS_VALUES.map((val, i) => (
            <div key={i} className="flex flex-col gap-1 text-center">
              <span className="text-3xl font-bold text-white">{val}</span>
              <span className="text-sm text-white/40">{tr.statsLabels[i]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">{lang === 'es' ? 'Todo lo que necesitas' : 'Everything you need'}</p>
            <h2 className="text-4xl font-bold text-white text-balance">{tr.featuresTitle}</h2>
            <p className="text-white/40 max-w-lg mx-auto leading-relaxed text-pretty">{tr.featuresSub}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 rounded-xl overflow-hidden">
            {tr.features.map((f, i) => {
              const Icon = ICONS[i]
              return (
                <div key={f.title} className="bg-black p-8 flex flex-col gap-4 hover:bg-white/[0.03] transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-white text-[15px]">{f.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">{tr.howSub}</p>
            <h2 className="text-4xl font-bold text-white text-balance">{tr.howTitle}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {tr.steps.map((step, i) => (
              <div key={i} className="relative flex flex-col gap-5">
                {i < tr.steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-full w-full h-px bg-white/10 -translate-x-4 z-0" />
                )}
                <div className="relative z-10 w-12 h-12 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                  <span className="text-xs font-mono text-primary font-bold">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="py-24 px-6 border-t border-white/10" suppressHydrationWarning>
        <div className="max-w-5xl mx-auto" suppressHydrationWarning>
          <div className="text-center mb-14 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">{lang === 'es' ? 'Pago por uso' : 'Pay as you go'}</p>
            <h2 className="text-4xl font-bold text-white text-balance">{tr.pricingTitle}</h2>
            <p className="text-white/40 max-w-md mx-auto text-pretty leading-relaxed">{tr.pricingSub}</p>
          </div>
          {mounted && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {packs.map((pack, i) => {
              const credits = Number(pack.credits)
              const bonus = Number(pack.bonus_credits)
              const price = Number(pack.price_usd)
              const totalCredits = credits + bonus
              const perK = totalCredits > 0 ? ((price / totalCredits) * 1000).toFixed(2) : '?'
              const isPopular = i === 1
              // Use a fixed locale to avoid SSR/client hydration mismatch
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
                      <span className="text-xs px-3 py-1 bg-primary text-white rounded-full font-medium">{tr.popularLabel}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-white/50 font-medium">{pack.name}</p>
                    <p className="text-4xl font-bold text-white">${price}</p>
                    <p className="text-sm text-white/40">{creditsLabel} {lang === 'es' ? 'créditos' : 'credits'}</p>
                    {bonus > 0 && (
                      <p className="text-xs text-green-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" />+{bonus.toLocaleString('en-US')} {lang === 'es' ? 'créditos bonus' : 'bonus credits'}
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
                    <Button size="sm" className={`w-full ${isPopular ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                      {lang === 'es' ? 'Empezar' : 'Get started'} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              )
            })}
          </div>}
          <p className="text-center text-sm text-white/30 mt-8">
            {tr.pricingNote}{' '}
            <Link href={`${base}/pricing`} className="text-primary hover:underline">{tr.pricingNoteLink}</Link>
            {' '}{tr.pricingNoteOr}
          </p>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 px-6 border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-white text-balance">{tr.testimonialsTitle}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {tr.testimonials.map(testimony => (
              <div key={testimony.author} className="rounded-xl border border-white/10 bg-black p-7 flex flex-col gap-5">
                <p className="text-sm text-white/60 leading-relaxed">&ldquo;{testimony.quote}&rdquo;</p>
                <div className="flex flex-col gap-0.5 mt-auto">
                  <p className="text-sm font-medium text-white">{testimony.author}</p>
                  <p className="text-xs text-white/30">{testimony.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 px-6 border-t border-white/10 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[400px] rounded-full bg-primary/10 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center gap-6">
          <Clock className="w-10 h-10 text-primary/50" />
          <h2 className="text-4xl md:text-5xl font-bold text-white text-balance leading-tight">{tr.ctaFinalTitle}</h2>
          <p className="text-white/40 leading-relaxed text-pretty">{tr.ctaFinalSub}</p>
          <Link href="/register">
            <Button size="lg" className="bg-white text-black hover:bg-white/90 font-semibold px-8 gap-2">
              {tr.ctaFinalBtn} <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}
