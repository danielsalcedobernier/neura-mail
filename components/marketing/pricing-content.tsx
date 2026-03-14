import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRight, Minus, Zap } from 'lucide-react'
import type { Lang } from '@/i18n/translations'
import { t } from '@/i18n/translations'

interface CreditPack {
  id: string
  name: string
  credits: number | string
  bonus_credits: number | string
  price_usd: number | string
}

const FEATURE_KEYS = ['verification', 'campaigns', 'ai', 'api', 'smtp', 'support'] as const

// Middle pack gets highlighted as most popular
function isPopular(index: number, total: number) {
  return index === Math.floor(total / 2) - (total % 2 === 0 ? 1 : 0)
}

export default function PricingContent({ lang, packs }: { lang: Lang; packs: CreditPack[] }) {
  const tr = t[lang].pricing

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 px-6 text-center">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">{tr.badge}</p>
          <h1 className="text-5xl font-bold text-white text-balance leading-tight">
            {tr.h1a}<br />{tr.h1b}
          </h1>
          <p className="text-white/40 text-lg leading-relaxed text-pretty">{tr.sub}</p>
        </div>
      </section>

      {/* Cards */}
      <section className="px-6 pb-20">
        <div className={`max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 ${packs.length <= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
          {packs.map((pack, i) => {
            const credits = Number(pack.credits)
            const bonus = Number(pack.bonus_credits)
            const price = Number(pack.price_usd)
            const perK = credits > 0 ? ((price / (credits + bonus)) * 1000).toFixed(2) : '?'
            const highlight = isPopular(i, packs.length)

            return (
              <div
                key={pack.id}
                className={`relative rounded-xl border p-7 flex flex-col gap-6 ${
                  highlight ? 'border-primary/50 bg-primary/5' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-xs px-3 py-1 bg-primary text-white rounded-full font-medium">{tr.mostPopular}</span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-white/50">{pack.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-white">${price}</span>
                    <span className="text-white/30 text-sm mb-1.5">{tr.perPack}</span>
                  </div>
                  <p className="text-sm text-white/60 font-medium">
                    {credits.toLocaleString()} {lang === 'es' ? 'créditos' : 'credits'}
                  </p>
                  {bonus > 0 && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      +{bonus.toLocaleString()} {tr.bonus}
                    </p>
                  )}
                  <p className="text-xs text-white/20">${perK} {lang === 'es' ? 'por 1.000' : 'per 1,000'}</p>
                </div>

                <ul className="flex flex-col gap-2 flex-1 text-sm text-white/50">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />{lang === 'es' ? 'Verificación de emails' : 'Email verification'}</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />{lang === 'es' ? 'Envío de campañas' : 'Campaign sending'}</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />{lang === 'es' ? 'Acceso a la API' : 'API access'}</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />{lang === 'es' ? 'Sin vencimiento' : 'No expiry'}</li>
                </ul>

                <Link href="/register">
                  <Button className={`w-full ${highlight ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                    {lang === 'es' ? 'Empezar' : 'Get started'} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            )
          })}
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 py-16 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-10 text-center">{tr.comparison}</h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="text-left py-4 px-6 text-white/40 font-normal">{lang === 'es' ? 'Función' : 'Feature'}</th>
                  <th className="py-4 px-6 text-center text-white/70 font-semibold">{lang === 'es' ? 'Todos los packs' : 'All packs'}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [lang === 'es' ? 'Verificación de email' : 'Email verification', true],
                  [lang === 'es' ? 'Detección de rebotes' : 'Bounce detection', true],
                  [lang === 'es' ? 'Envío de campañas' : 'Campaign sending', true],
                  [lang === 'es' ? 'Escritura IA' : 'AI writing', true],
                  [lang === 'es' ? 'Acceso a la API REST' : 'REST API access', true],
                  [lang === 'es' ? 'SMTP propio' : 'Custom SMTP', true],
                  [lang === 'es' ? 'Sin vencimiento de créditos' : 'Credits never expire', true],
                  [lang === 'es' ? 'Soporte por email' : 'Email support', true],
                ].map(([label, val], fi) => (
                  <tr key={fi} className={`border-b border-white/5 ${fi % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="py-4 px-6 text-white/50">{label as string}</td>
                    <td className="py-4 px-6 text-center">
                      <CheckCircle2 className="w-4 h-4 text-primary/70 mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 border-t border-white/10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-12 text-center">{tr.faqTitle}</h2>
          <div className="flex flex-col divide-y divide-white/10">
            {tr.faq.map(item => (
              <div key={item.q} className="py-6 flex flex-col gap-2">
                <p className="font-medium text-white">{item.q}</p>
                <p className="text-sm text-white/40 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/10 text-center">
        <div className="max-w-xl mx-auto flex flex-col items-center gap-5">
          <h2 className="text-3xl font-bold text-white text-balance">{tr.ctaTitle}</h2>
          <p className="text-white/40 text-pretty">{tr.ctaSub}</p>
          <Link href="/register">
            <Button size="lg" className="bg-white text-black hover:bg-white/90 font-semibold px-8 gap-2">
              {tr.ctaBtn} <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}
