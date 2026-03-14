import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRight, Minus } from 'lucide-react'
import type { Lang } from '@/i18n/translations'
import { t } from '@/i18n/translations'

const PACKS_DATA = [
  { price: 9,   credits: 5000,   bonus: 0,     perK: '1.80', highlight: false },
  { price: 35,  credits: 25000,  bonus: 0,     perK: '1.40', highlight: true  },
  { price: 100, credits: 100000, bonus: 0,     perK: '1.00', highlight: false },
  { price: 400, credits: 500000, bonus: 50000, perK: '0.73', highlight: false },
]

const FEATURE_KEYS = ['verification', 'campaigns', 'ai', 'api', 'smtp', 'support'] as const

export default function PricingContent({ lang }: { lang: Lang }) {
  const tr = t[lang].pricing
  const plans = tr.plans

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
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PACKS_DATA.map((pack, i) => {
            const plan = plans[i]
            return (
              <div
                key={plan.name}
                className={`relative rounded-xl border p-7 flex flex-col gap-6 ${
                  pack.highlight ? 'border-primary/50 bg-primary/5' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {pack.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-xs px-3 py-1 bg-primary text-white rounded-full font-medium">{tr.mostPopular}</span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-white/50">{plan.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold text-white">${pack.price}</span>
                    <span className="text-white/30 text-sm mb-1.5">{tr.perPack}</span>
                  </div>
                  <p className="text-xs text-white/30">
                    {pack.credits.toLocaleString()} {lang === 'es' ? 'créditos' : 'credits'}
                    {pack.bonus > 0 && <span className="text-green-400 ml-1">+{pack.bonus.toLocaleString()} {tr.bonus}</span>}
                  </p>
                  <p className="text-xs text-white/20">${pack.perK} {lang === 'es' ? 'por 1.000' : 'per 1,000'}</p>
                </div>

                <ul className="flex flex-col gap-2.5 flex-1 text-sm">
                  {FEATURE_KEYS.map((key, fi) => {
                    const val = plan.features[key]
                    return (
                      <li key={key} className="flex items-center gap-2 text-white/50">
                        {val === true ? (
                          <CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />
                        ) : val === false ? (
                          <Minus className="w-4 h-4 text-white/15 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />
                        )}
                        <span className={val === false ? 'text-white/20' : ''}>
                          {val === true || val === false ? tr.featureRows[fi] : `${tr.featureRows[fi]}: ${val}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                <Link href="/register">
                  <Button className={`w-full ${pack.highlight ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
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
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-10 text-center">{tr.comparison}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-4 pr-6 text-white/40 font-normal w-48">{lang === 'es' ? 'Función' : 'Feature'}</th>
                  {plans.map(p => (
                    <th key={p.name} className="py-4 px-4 text-center text-white font-semibold">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_KEYS.map((key, fi) => (
                  <tr key={key} className={`border-b border-white/5 ${fi % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="py-4 pr-6 text-white/50">{tr.featureRows[fi]}</td>
                    {plans.map(p => {
                      const val = p.features[key]
                      return (
                        <td key={p.name} className="py-4 px-4 text-center">
                          {val === true ? (
                            <CheckCircle2 className="w-4 h-4 text-primary/70 mx-auto" />
                          ) : val === false ? (
                            <Minus className="w-4 h-4 text-white/15 mx-auto" />
                          ) : (
                            <span className="text-white/50 text-xs">{val as string}</span>
                          )}
                        </td>
                      )
                    })}
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
