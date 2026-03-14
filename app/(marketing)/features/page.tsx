import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Shield, Send, Zap, BarChart3, Key, Globe,
  CheckCircle2, ArrowRight, Database, Lock, RefreshCw,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Features — NeuraMail',
  description: 'Everything you need for clean email lists and high-deliverability campaigns.',
}

const SECTIONS = [
  {
    label: 'Verification',
    icon: Shield,
    heading: 'The cleanest email lists in the industry',
    subheading: 'Remove bad emails before they cost you — in deliverability, reputation, and real money.',
    points: [
      'MX record validation — checks if the domain can receive mail at all',
      'SMTP handshake verification — confirms the mailbox exists without sending',
      'Disposable domain database — 12,000+ known throwaway providers',
      'Role account detection — filters info@, admin@, noreply@, etc.',
      'Catch-all identification — flags servers that accept everything',
      'Spam trap detection — protects your sender score',
      '30-day result cache — re-verify for free within the window',
    ],
    code: null,
    flip: false,
  },
  {
    label: 'Campaigns',
    icon: Send,
    heading: 'Send campaigns your way',
    subheading: 'Connect your own SMTP servers or use our shared infrastructure. You stay in control.',
    points: [
      'Per-provider rate limiting — set max emails per minute per server',
      'Automatic SMTP rotation — NeuraMail distributes load intelligently',
      'Unsubscribe link injection — auto-inserts one-click unsubscribe per CAN-SPAM/GDPR',
      'HTML + plain text support — both sent in every campaign',
      'Scheduled sending — set a date and time, we handle the rest',
      'Real-time status tracking — see sent, failed, and queued counts live',
    ],
    code: null,
    flip: true,
  },
  {
    label: 'AI Writing',
    icon: Zap,
    heading: 'Write better emails in seconds',
    subheading: 'Built-in AI understands your product and generates copy that converts.',
    points: [
      'Describe your campaign in plain language',
      'Get a compelling subject line, preheader, and full HTML body',
      'Plain-text version auto-generated from HTML',
      'Tone selector: professional, friendly, urgent, minimal',
      'Edit inline or regenerate specific sections',
      'Works with any SMTP or provider configuration',
    ],
    code: null,
    flip: false,
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    heading: 'Know what\'s working',
    subheading: 'Real-time metrics per campaign, per list, per SMTP provider.',
    points: [
      'Open rate and unique open tracking',
      'Click-through rate per link',
      'Bounce and hard-bounce breakdown',
      'Unsubscribe and complaint rate',
      'Verification success rate per list',
      'Credit usage over time',
    ],
    code: null,
    flip: true,
  },
]

const API_FEATURES = [
  {
    icon: Key,
    title: 'API Key Auth',
    desc: 'Secure per-user API keys with one-click regeneration. Pass as a Bearer token or X-API-Key header.',
  },
  {
    icon: Database,
    title: 'Result caching',
    desc: 'Verified addresses are cached. Subsequent calls to the same address return instantly and cost zero credits.',
  },
  {
    icon: Lock,
    title: 'Rate limiting',
    desc: 'Configurable rate limits per user and per IP. Our admin panel lets you tune limits per plan.',
  },
  {
    icon: RefreshCw,
    title: 'Batch endpoint',
    desc: 'POST an array of up to 1,000 addresses and get back all results in a single response.',
  },
  {
    icon: Globe,
    title: 'Global CDN',
    desc: 'Edge-deployed API endpoints with <200ms median response globally.',
  },
  {
    icon: BarChart3,
    title: 'Usage stats',
    desc: 'Query your remaining credits and usage history via the API — no dashboard login required.',
  },
]

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-32 pb-20 px-6 text-center">
        <div className="max-w-3xl mx-auto flex flex-col gap-5">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold">Features</p>
          <h1 className="text-5xl font-bold text-white text-balance leading-tight">
            Every tool your email program needs
          </h1>
          <p className="text-white/40 text-lg leading-relaxed text-pretty">
            Verification, sending, AI copy, and analytics — in a single platform with one unified credit balance.
          </p>
        </div>
      </section>

      {/* Feature sections — alternating layout */}
      {SECTIONS.map((section) => {
        const Icon = section.icon
        return (
          <section
            key={section.label}
            className="py-20 px-6 border-t border-white/10"
          >
            <div className={`max-w-6xl mx-auto flex flex-col ${section.flip ? 'md:flex-row-reverse' : 'md:flex-row'} gap-16 items-center`}>
              {/* Text */}
              <div className="flex-1 flex flex-col gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-xs uppercase tracking-widest text-primary font-semibold">{section.label}</span>
                </div>
                <h2 className="text-3xl font-bold text-white text-balance leading-tight">
                  {section.heading}
                </h2>
                <p className="text-white/40 leading-relaxed">{section.subheading}</p>
                <ul className="flex flex-col gap-3">
                  {section.points.map(p => (
                    <li key={p} className="flex items-start gap-3 text-sm text-white/60">
                      <CheckCircle2 className="w-4 h-4 text-primary/70 mt-0.5 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Visual placeholder — styled mockup card */}
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
            <h2 className="text-3xl font-bold text-white text-balance">Built for developers</h2>
            <p className="text-white/40 max-w-lg mx-auto leading-relaxed text-pretty">
              Integrate email verification directly into your product. Clean, predictable JSON responses every time.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {API_FEATURES.map(f => {
              const Icon = f.icon
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

          {/* Code snippet */}
          <div className="rounded-xl border border-white/10 bg-black overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
              <div className="w-3 h-3 rounded-full bg-white/10" />
              <div className="w-3 h-3 rounded-full bg-white/10" />
              <div className="w-3 h-3 rounded-full bg-white/10" />
              <span className="text-xs text-white/30 ml-2 font-mono">GET /api/v1/verify</span>
            </div>
            <pre className="p-6 text-sm font-mono text-white/70 overflow-x-auto leading-relaxed">
{`curl -X GET \\
  "https://neuramail.io/api/v1/verify?email=user@example.com" \\
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
            <Link href="/docs">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 gap-2">
                Read the full API docs <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 border-t border-white/10 text-center">
        <div className="max-w-xl mx-auto flex flex-col items-center gap-5">
          <h2 className="text-3xl font-bold text-white text-balance">Ready to get started?</h2>
          <p className="text-white/40 text-pretty">100 free credits on signup. No card required.</p>
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
