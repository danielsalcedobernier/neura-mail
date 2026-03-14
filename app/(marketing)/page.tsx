import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowRight, CheckCircle2, Zap, Shield, BarChart3,
  Send, Key, TrendingUp, Clock, Globe
} from 'lucide-react'

/* ─── STATS ─────────────────────────────────────────────── */
const STATS = [
  { value: '99.8%', label: 'Verification accuracy' },
  { value: '< 200ms', label: 'Avg. API response' },
  { value: '50M+', label: 'Emails verified' },
  { value: '99.9%', label: 'Platform uptime' },
]

/* ─── FEATURES ───────────────────────────────────────────── */
const FEATURES = [
  {
    icon: Shield,
    title: 'Bulk Email Verification',
    desc: 'Upload CSV lists and verify millions of addresses. Detects bounces, spam traps, role accounts, catch-alls, and disposable domains in real time.',
  },
  {
    icon: Send,
    title: 'Campaign Sending',
    desc: 'Send newsletters and drip campaigns through your own SMTP servers or our managed infrastructure — with per-domain throttling and open tracking.',
  },
  {
    icon: Zap,
    title: 'AI-Powered Copywriting',
    desc: 'Generate subject lines, HTML email bodies, and plain-text versions with a single prompt. Integrated directly into the campaign builder.',
  },
  {
    icon: Key,
    title: 'REST API',
    desc: 'Verify single addresses or entire batches via API. Returns valid, invalid, risky, catch-all, and disposable statuses with confidence scores.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    desc: 'Track open rates, click-through rates, bounce rates, and unsubscribes in real time. Exportable reports included.',
  },
  {
    icon: Globe,
    title: 'SMTP Management',
    desc: 'Connect unlimited SMTP servers, set sending limits per provider, and let NeuraMail rotate sending intelligently to protect your reputation.',
  },
]

/* ─── HOW IT WORKS ───────────────────────────────────────── */
const STEPS = [
  {
    num: '01',
    title: 'Upload your list',
    desc: 'Import a CSV with any structure. We auto-detect the email column. Lists of 100 to 10 million are handled identically.',
  },
  {
    num: '02',
    title: 'Verify in the background',
    desc: 'Our workers check MX records, SMTP handshakes, disposable domain databases, and our proprietary catch-all detection engine.',
  },
  {
    num: '03',
    title: 'Download clean data',
    desc: 'Get back a segmented CSV: valid, invalid, risky, and catch-all — with a detailed per-address breakdown. Use it anywhere.',
  },
]

/* ─── PRICING TEASER ─────────────────────────────────────── */
const PLANS = [
  {
    name: 'Starter',
    price: '$9',
    credits: '5,000',
    perK: '$1.80',
    features: ['Bulk verification', 'CSV export', 'Email support'],
    cta: 'Get started',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$35',
    credits: '25,000',
    perK: '$1.40',
    features: ['Everything in Starter', 'Campaign sending', 'AI copy generation', 'Analytics'],
    cta: 'Get started',
    highlight: true,
  },
  {
    name: 'Scale',
    price: '$400',
    credits: '500,000',
    perK: '$0.80',
    features: ['Everything in Growth', 'Custom SMTP', 'Priority support', 'REST API access'],
    cta: 'Get started',
    highlight: false,
  },
]

/* ─── TESTIMONIALS ───────────────────────────────────────── */
const TESTIMONIALS = [
  {
    quote: 'Cut our bounce rate from 14% to under 0.3% in the first week. NeuraMail paid for itself in hours.',
    author: 'Sofia R.',
    role: 'Head of Growth, SaaSify',
  },
  {
    quote: 'The API is clean, the docs are clear, and the verification speed is honestly unreal. Exactly what we needed.',
    author: 'Marcus T.',
    role: 'Lead Engineer, Launchpad',
  },
  {
    quote: 'We went from manually cleaning lists to a fully automated pipeline. 2 million emails verified per month, no drama.',
    author: 'Camille D.',
    role: 'Email Marketing Manager, Helix',
  },
]

/* ════════════════════════════════════════════════════════════
   PAGE
════════════════════════════════════════════════════════════ */
export default async function HomePage() {
  const session = await getSession()
  if (session?.role === 'admin') redirect('/admin')
  else if (session) redirect('/dashboard')

  return (
    <>
      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-6 overflow-hidden">
        {/* subtle grid overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        {/* blue glow */}
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/10 blur-[120px]" />

        <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-white/60">
            <TrendingUp className="w-3 h-3 text-primary" />
            Trusted by 3,000+ marketers and engineering teams
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white text-balance leading-[1.08] tracking-tight">
            Verify emails.<br />
            <span className="text-primary">Send with confidence.</span>
          </h1>

          <p className="text-lg text-white/50 max-w-xl leading-relaxed text-pretty">
            NeuraMail removes bad emails before they hurt your deliverability — then lets you send campaigns through your own SMTP at any scale.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Link href="/register">
              <Button size="lg" className="bg-white text-black hover:bg-white/90 font-semibold px-7 gap-2">
                Start for free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 px-7">
                View pricing
              </Button>
            </Link>
          </div>

          {/* micro social proof */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4">
            {['No credit card required', 'Free tier included', 'Cancel any time'].map(t => (
              <span key={t} className="flex items-center gap-1.5 text-xs text-white/40">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary/70" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(s => (
            <div key={s.label} className="flex flex-col gap-1 text-center">
              <span className="text-3xl font-bold text-white">{s.value}</span>
              <span className="text-sm text-white/40">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">Everything you need</p>
            <h2 className="text-4xl font-bold text-white text-balance">One platform. Every email use case.</h2>
            <p className="text-white/40 max-w-lg mx-auto leading-relaxed text-pretty">
              From one-off list cleaning to automated campaign pipelines — NeuraMail handles the full lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 rounded-xl overflow-hidden">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="bg-black p-8 flex flex-col gap-4 hover:bg-white/[0.03] transition-colors"
                >
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

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">Simple by design</p>
            <h2 className="text-4xl font-bold text-white text-balance">How verification works</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative flex flex-col gap-5">
                {/* connector line */}
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-full w-full h-px bg-white/10 -translate-x-4 z-0" />
                )}
                <div className="relative z-10 w-12 h-12 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                  <span className="text-xs font-mono text-primary font-bold">{step.num}</span>
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

      {/* ── PRICING TEASER ── */}
      <section className="py-24 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 flex flex-col gap-3">
            <p className="text-xs uppercase tracking-widest text-primary font-semibold">Pay as you go</p>
            <h2 className="text-4xl font-bold text-white text-balance">Simple credit-based pricing</h2>
            <p className="text-white/40 max-w-md mx-auto text-pretty leading-relaxed">
              Buy credits once, use them for verification or sending. No subscriptions, no surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`relative rounded-xl border p-7 flex flex-col gap-6 ${
                  plan.highlight
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-xs px-3 py-1 bg-primary text-white rounded-full font-medium">Most popular</span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-white/50 font-medium">{plan.name}</p>
                  <p className="text-4xl font-bold text-white">{plan.price}</p>
                  <p className="text-xs text-white/30">{plan.credits} credits · {plan.perK} per 1k</p>
                </div>
                <ul className="flex flex-col gap-2.5 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                      <CheckCircle2 className="w-4 h-4 text-primary/70 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register">
                  <Button
                    size="sm"
                    className={`w-full ${plan.highlight ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-white/30 mt-8">
            Need more volume?{' '}
            <Link href="/pricing" className="text-primary hover:underline">See all packages</Link>
            {' '}or contact us for a custom quote.
          </p>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 px-6 border-t border-white/10 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold text-white text-balance">Loved by email teams</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map(t => (
              <div key={t.author} className="rounded-xl border border-white/10 bg-black p-7 flex flex-col gap-5">
                <p className="text-sm text-white/60 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex flex-col gap-0.5 mt-auto">
                  <p className="text-sm font-medium text-white">{t.author}</p>
                  <p className="text-xs text-white/30">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-32 px-6 border-t border-white/10 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[400px] rounded-full bg-primary/10 blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto text-center flex flex-col items-center gap-6">
          <Clock className="w-10 h-10 text-primary/50" />
          <h2 className="text-4xl md:text-5xl font-bold text-white text-balance leading-tight">
            Start cleaning your list today
          </h2>
          <p className="text-white/40 leading-relaxed text-pretty">
            Sign up in under 60 seconds. No credit card needed for your first 100 verifications.
          </p>
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
