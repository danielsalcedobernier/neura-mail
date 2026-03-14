import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Shield, Send, Zap, BarChart3, Key, Globe,
  CheckCircle2, ArrowRight, Database, Lock, RefreshCw,
} from 'lucide-react'
import type { Lang } from '@/i18n/translations'
import { t } from '@/i18n/translations'

const SECTION_ICONS = [Shield, Send, Zap, BarChart3]
const API_ICONS = [Key, Database, Lock, RefreshCw, Globe, BarChart3]

export default function FeaturesContent({ lang }: { lang: Lang }) {
  const tr = t[lang].features
  const base = lang === 'en' ? '/en' : ''

  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-20 px-6 text-center">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">{tr.badge}</p>
          <h1 className="text-5xl font-bold text-white text-balance leading-tight">{tr.h1}</h1>
          <p className="text-white/40 text-lg leading-relaxed text-pretty">{tr.sub}</p>
        </div>
      </section>

      {/* Feature sections — alternating */}
      {tr.sections.map((section, idx) => {
        const Icon = SECTION_ICONS[idx]
        const flip = idx % 2 !== 0
        return (
          <section key={section.label} className="py-20 px-6 border-t border-white/10">
            <div className={`max-w-6xl mx-auto flex flex-col ${flip ? 'md:flex-row-reverse' : 'md:flex-row'} gap-16 items-center`}>
              <div className="flex-1 flex flex-col gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-xs uppercase tracking-widest text-primary font-semibold">{section.label}</span>
                </div>
                <h2 className="text-3xl font-bold text-white text-balance leading-tight">{section.heading}</h2>
                <p className="text-white/40 leading-relaxed">{section.subheading}</p>
                <ul className="flex flex-col gap-3">
                  {section.points.map(p => (
                    <li key={p} className="flex items-start gap-3 text-sm text-white/60">
                      <CheckCircle2 className="w-4 h-4 text-primary/70 mt-0.5 shrink-0" />{p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex-1 w-full">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 aspect-[4/3] flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-8 h-8 text-primary/60" />
                    </div>
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      {[100, 75, 90, 60].map((w, i) => (
                        <div key={i} className="h-2 rounded-full bg-white/10" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <div className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-mono">valid: 94.2%</div>
                      <div className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-mono">invalid: 4.1%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )
      })}

      {/* API section */}
      <section className="py-24 px-6 border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 flex flex-col gap-3">
            <div className="inline-flex items-center gap-2 justify-center">
              <Key className="w-4 h-4 text-primary" />
              <span className="text-xs uppercase tracking-widest text-primary font-semibold">REST API</span>
            </div>
            <h2 className="text-3xl font-bold text-white text-balance">{tr.apiTitle}</h2>
            <p className="text-white/40 max-w-lg mx-auto leading-relaxed text-pretty">{tr.apiSub}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {tr.apiFeatures.map((f, i) => {
              const Icon = API_ICONS[i]
              return (
                <div key={f.title} className="rounded-xl border border-white/10 bg-black p-6 flex flex-col gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="font-medium text-white text-sm">{f.title}</p>
                  <p className="text-xs text-white/40 leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-white/10 bg-black overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
              <div className="w-3 h-3 rounded-full bg-white/10" />
              <div className="w-3 h-3 rounded-full bg-white/10" />
              <div className="w-3 h-3 rounded-full bg-white/10" />
              <span className="text-xs text-white/30 ml-2 font-mono">GET /api/v1/verify</span>
            </div>
            <pre className="p-6 text-sm font-mono text-white/70 overflow-x-auto leading-relaxed">
{`curl -X GET \\
  "https://neuramail.cl/api/v1/verify?email=user@example.com" \\
  -H "Authorization: Bearer nm_live_xxxxxxxx"

// Response
{
  "email": "user@example.com",
  "status": "valid",
  "sub_status": null,
  "is_catchall": false,
  "mx_found": true,
  "credits_used": 1,
  "cached": false
}`}
            </pre>
          </div>

          <div className="text-center mt-8">
            <Link href={`${base}/docs`}>
              <Button className="bg-transparent border border-white/25 text-white hover:bg-white/10 hover:text-white gap-2">
                {tr.docsBtn} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/10 text-center">
        <div className="max-w-xl mx-auto flex flex-col items-center gap-5">
          <h2 className="text-3xl font-bold text-white text-balance">{tr.ctaTitle}</h2>
          <p className="text-white/40 text-pretty">{tr.ctaSub}</p>
          <Link href="/register">
            <Button size="lg" className="bg-white text-black hover:bg-white/90 hover:text-black font-semibold px-8 gap-2">
              {tr.ctaBtn} <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}
