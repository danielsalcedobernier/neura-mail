import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRight, Minus } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Pricing — NeuraMail',
  description: 'Simple credit-based pricing. Buy once, use for verification and campaign sending. No subscriptions.',
}

const PACKS = [
  {
    name: 'Starter',
    price: 9,
    credits: 5000,
    bonus: 0,
    perK: '1.80',
    highlight: false,
    features: {
      verification: true,
      campaigns: false,
      ai: false,
      api: false,
      smtp: false,
      support: 'Email',
    },
  },
  {
    name: 'Growth',
    price: 35,
    credits: 25000,
    bonus: 0,
    perK: '1.40',
    highlight: true,
    features: {
      verification: true,
      campaigns: true,
      ai: true,
      api: false,
      smtp: false,
      support: 'Email + Chat',
    },
  },
  {
    name: 'Pro',
    price: 100,
    credits: 100000,
    bonus: 0,
    perK: '1.00',
    highlight: false,
    features: {
      verification: true,
      campaigns: true,
      ai: true,
      api: true,
      smtp: false,
      support: 'Priority',
    },
  },
  {
    name: 'Scale',
    price: 400,
    credits: 500000,
    bonus: 50000,
    perK: '0.73',
    highlight: false,
    features: {
      verification: true,
      campaigns: true,
      ai: true,
      api: true,
      smtp: true,
      support: 'Dedicated',
    },
  },
]

const COMPARISON_ROWS = [
  { label: 'Bulk email verification', key: 'verification' },
  { label: 'Campaign sending', key: 'campaigns' },
  { label: 'AI copy generation', key: 'ai' },
  { label: 'REST API access', key: 'api' },
  { label: 'Custom SMTP servers', key: 'smtp' },
  { label: 'Support level', key: 'support' },
]

const FAQ = [
  {
    q: 'What counts as one credit?',
    a: 'One credit = one email verification OR one email sent via campaign. Verification results are cached for 30 days, so re-checking the same address is free.',
  },
  {
    q: 'Do credits expire?',
    a: 'No. Credits never expire. Buy a large pack when it suits you and use them over months or years.',
  },
  {
    q: 'Can I upgrade mid-purchase?',
    a: 'Credits stack. Buy any combination of packs at any time — they all go into the same balance.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept all major credit cards and PayPal via secure checkout. Invoices are available for amounts over $200.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Yes — new accounts receive 100 free verification credits on signup, no credit card required.',
  },
  {
    q: 'What is the catch-all detection?',
    a: 'Some mail servers accept all incoming messages regardless of whether the mailbox exists. NeuraMail flags these addresses as "catch-all" so you can decide whether to contact them.',
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-16 px-6 text-center">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">Pricing</p>
          <h1 className="text-5xl font-bold text-white text-balance leading-tight">
            Pay for what you use.<br />Nothing else.
          </h1>
          <p className="text-white/40 text-lg leading-relaxed text-pretty">
            Credits work for both verification and campaign sending. No monthly fees, no seat limits, no surprises.
          </p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="px-6 pb-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PACKS.map(pack => (
            <div
              key={pack.name}
              className={`relative rounded-xl border p-7 flex flex-col gap-6 ${
                pack.highlight
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              {pack.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-xs px-3 py-1 bg-primary text-white rounded-full font-medium">
                    Most popular
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-white/50">{pack.name}</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-white">${pack.price}</span>
                  <span className="text-white/30 text-sm mb-1.5">/ pack</span>
                </div>
                <p className="text-xs text-white/30">
                  {pack.credits.toLocaleString()} credits
                  {pack.bonus > 0 && (
                    <span className="text-green-400 ml-1">+{pack.bonus.toLocaleString()} bonus</span>
                  )}
                </p>
                <p className="text-xs text-white/20">${pack.perK} per 1,000</p>
              </div>

              <ul className="flex flex-col gap-2.5 flex-1 text-sm">
                {COMPARISON_ROWS.map(row => {
                  const val = pack.features[row.key as keyof typeof pack.features]
                  return (
                    <li key={row.key} className="flex items-center gap-2 text-white/50">
                      {val === true ? (
                        <CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />
                      ) : val === false ? (
                        <Minus className="w-4 h-4 text-white/15 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-primary/70 shrink-0" />
                      )}
                      <span className={val === false ? 'text-white/20' : ''}>
                        {val === true ? row.label : val === false ? row.label : `${row.label}: ${val}`}
                      </span>
                    </li>
                  )
                })}
              </ul>

              <Link href="/register">
                <Button
                  className={`w-full ${
                    pack.highlight
                      ? 'bg-primary hover:bg-primary/90 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  Get started <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table (desktop) */}
      <section className="px-6 py-16 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-10 text-center">Full feature comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-4 pr-6 text-white/40 font-normal w-48">Feature</th>
                  {PACKS.map(p => (
                    <th key={p.name} className="py-4 px-4 text-center text-white font-semibold">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.key} className={`border-b border-white/5 ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                    <td className="py-4 pr-6 text-white/50">{row.label}</td>
                    {PACKS.map(p => {
                      const val = p.features[row.key as keyof typeof p.features]
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
          <h2 className="text-3xl font-bold text-white mb-12 text-center">Frequently asked questions</h2>
          <div className="flex flex-col divide-y divide-white/10">
            {FAQ.map(item => (
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
          <h2 className="text-3xl font-bold text-white text-balance">Start with 100 free credits</h2>
          <p className="text-white/40 text-pretty">No credit card. No commitment. Just clean emails.</p>
          <Link href="/register">
            <Button size="lg" className="bg-white text-black hover:bg-white/90 font-semibold px-8 gap-2">
              Create free account <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}
