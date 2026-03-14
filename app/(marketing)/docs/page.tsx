import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Key, Globe, Zap, Shield } from 'lucide-react'

export const metadata: Metadata = {
  title: 'API Documentation — NeuraMail',
  description: 'Integrate email verification into your product with the NeuraMail REST API.',
}

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/verify',
    desc: 'Verify a single email address. Returns status, sub-status, MX info, and whether the result was cached.',
    params: [
      { name: 'email', type: 'string', required: true, desc: 'The email address to verify.' },
    ],
    response: `{
  "data": {
    "email": "user@example.com",
    "status": "valid",
    "sub_status": null,
    "is_catchall": false,
    "mx_found": true,
    "credits_used": 1,
    "cached": false
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/verify/batch',
    desc: 'Verify up to 1,000 email addresses in a single request.',
    params: [
      { name: 'emails', type: 'string[]', required: true, desc: 'Array of email addresses (max 1,000).' },
    ],
    response: `{
  "data": {
    "results": [
      { "email": "a@example.com", "status": "valid", "cached": true },
      { "email": "b@fake.io",     "status": "invalid", "sub_status": "disposable" }
    ],
    "total": 2,
    "credits_used": 1,
    "credits_cached": 1
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/credits',
    desc: 'Return the current credit balance and recent transaction history for the authenticated user.',
    params: [],
    response: `{
  "data": {
    "balance": 4820,
    "transactions": [
      { "amount": -1, "type": "verification", "created_at": "2025-03-14T10:00:00Z" }
    ]
  }
}`,
  },
]

const STATUSES = [
  { status: 'valid', color: 'text-green-400', desc: 'Mailbox exists and is likely to receive mail.' },
  { status: 'invalid', color: 'text-red-400', desc: 'Mailbox does not exist or the domain is non-functional.' },
  { status: 'risky', color: 'text-yellow-400', desc: 'Role address, recently deactivated, or low-confidence result.' },
  { status: 'catch_all', color: 'text-orange-400', desc: 'Server accepts all mail; individual mailbox cannot be confirmed.' },
  { status: 'unknown', color: 'text-white/40', desc: 'Server timed out or blocked the verification handshake.' },
]

const SUB_STATUSES = [
  'disposable', 'role_based', 'spam_trap', 'mx_not_found',
  'smtp_error', 'bounce', 'syntax_error',
]

const SIDEBAR = [
  { label: 'Authentication', href: '#auth' },
  { label: 'Verify single email', href: '#verify' },
  { label: 'Verify batch', href: '#batch' },
  { label: 'Credit balance', href: '#credits' },
  { label: 'Response statuses', href: '#statuses' },
  { label: 'Error codes', href: '#errors' },
]

export default function DocsPage() {
  return (
    <div className="pt-24 min-h-screen">
      <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row gap-12 py-16">

        {/* Sidebar */}
        <aside className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-24 flex flex-col gap-1">
            <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-3">API Reference</p>
            {SIDEBAR.map(s => (
              <a
                key={s.href}
                href={s.href}
                className="text-sm text-white/40 hover:text-white transition-colors py-1"
              >
                {s.label}
              </a>
            ))}
            <div className="mt-6 pt-6 border-t border-white/10">
              <Link href="/register">
                <Button size="sm" className="w-full bg-white text-black hover:bg-white/90 gap-1 text-xs">
                  Get API key <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-16">

          {/* Intro */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <span className="text-xs uppercase tracking-widest text-primary font-semibold">REST API</span>
            </div>
            <h1 className="text-4xl font-bold text-white">API Documentation</h1>
            <p className="text-white/40 leading-relaxed max-w-2xl">
              The NeuraMail API lets you verify email addresses and query your account programmatically.
              All endpoints return JSON. Authentication is via a per-user API key.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                <Globe className="w-3.5 h-3.5" />
                Base URL:
              </div>
              <code className="text-xs font-mono bg-white/5 border border-white/10 px-3 py-1 rounded text-white/60">
                https://neuramail.io
              </code>
            </div>
          </div>

          {/* Authentication */}
          <div id="auth" className="flex flex-col gap-5 scroll-mt-24">
            <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-3">Authentication</h2>
            <p className="text-sm text-white/50 leading-relaxed">
              Include your API key in every request using the <code className="text-white/80 bg-white/5 px-1 rounded">Authorization</code> header.
              Generate or rotate your key from the{' '}
              <Link href="/dashboard/api" className="text-primary hover:underline">API Keys</Link> page in the dashboard.
            </p>
            <div className="rounded-xl border border-white/10 bg-black overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-white/[0.03]">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-white/40 font-mono">Request header</span>
              </div>
              <pre className="p-5 text-sm font-mono text-white/70 overflow-x-auto leading-relaxed">
{`Authorization: Bearer nm_live_xxxxxxxxxxxxxxxxxxxx`}
              </pre>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
              <Shield className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-white/50 leading-relaxed">
                Keep your API key secret. Never expose it in client-side code or public repos.
                Rotate it immediately if you suspect it has been compromised.
              </p>
            </div>
          </div>

          {/* Endpoints */}
          {ENDPOINTS.map((ep, i) => {
            const anchor = i === 0 ? 'verify' : i === 1 ? 'batch' : 'credits'
            const methodColor = ep.method === 'GET' ? 'text-green-400 bg-green-400/10' : 'text-blue-400 bg-blue-400/10'
            return (
              <div key={ep.path} id={anchor} className="flex flex-col gap-5 scroll-mt-24">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${methodColor}`}>{ep.method}</span>
                  <code className="text-sm font-mono text-white">{ep.path}</code>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">{ep.desc}</p>

                {ep.params.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold">Parameters</p>
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      {ep.params.map((p, pi) => (
                        <div key={p.name} className={`flex flex-col sm:flex-row gap-2 sm:items-start p-4 text-sm ${pi > 0 ? 'border-t border-white/5' : ''}`}>
                          <code className="font-mono text-white/80 w-32 shrink-0">{p.name}</code>
                          <div className="flex flex-wrap gap-2 items-center flex-1">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono">{p.type}</span>
                            {p.required && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">required</span>}
                            <span className="text-white/40">{p.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <p className="text-xs uppercase tracking-widest text-white/30 font-semibold">Response</p>
                  <div className="rounded-xl border border-white/10 bg-black overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
                      <div className="w-2 h-2 rounded-full bg-green-400/60" />
                      <span className="text-xs text-white/30 font-mono">200 OK · application/json</span>
                    </div>
                    <pre className="p-5 text-xs font-mono text-white/60 overflow-x-auto leading-relaxed">{ep.response}</pre>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Statuses */}
          <div id="statuses" className="flex flex-col gap-5 scroll-mt-24">
            <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-3">Response statuses</h2>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {STATUSES.map((s, i) => (
                <div key={s.status} className={`flex items-start gap-4 p-4 text-sm ${i > 0 ? 'border-t border-white/5' : ''}`}>
                  <code className={`font-mono font-bold w-24 shrink-0 ${s.color}`}>{s.status}</code>
                  <span className="text-white/50">{s.desc}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-widest text-white/30 font-semibold">Sub-statuses</p>
              <div className="flex flex-wrap gap-2">
                {SUB_STATUSES.map(ss => (
                  <code key={ss} className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-white/40 font-mono">{ss}</code>
                ))}
              </div>
            </div>
          </div>

          {/* Errors */}
          <div id="errors" className="flex flex-col gap-5 scroll-mt-24">
            <h2 className="text-2xl font-bold text-white border-b border-white/10 pb-3">Error codes</h2>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {[
                { code: '400', msg: 'Bad Request', desc: 'Missing or invalid parameters.' },
                { code: '401', msg: 'Unauthorized', desc: 'API key missing or invalid.' },
                { code: '402', msg: 'Insufficient Credits', desc: 'Your account balance is too low.' },
                { code: '422', msg: 'Unprocessable Entity', desc: 'Email address failed syntax validation.' },
                { code: '429', msg: 'Too Many Requests', desc: 'Rate limit exceeded. Retry after the Retry-After header value.' },
                { code: '500', msg: 'Server Error', desc: 'Unexpected error. Contact support if it persists.' },
              ].map((e, i) => (
                <div key={e.code} className={`flex items-start gap-4 p-4 text-sm ${i > 0 ? 'border-t border-white/5' : ''}`}>
                  <code className="font-mono text-red-400 w-10 shrink-0">{e.code}</code>
                  <span className="text-white/70 w-36 shrink-0">{e.msg}</span>
                  <span className="text-white/40">{e.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-white">Ready to integrate?</p>
              <p className="text-sm text-white/40">Create a free account and get your API key in 60 seconds.</p>
            </div>
            <Link href="/register">
              <Button className="bg-white text-black hover:bg-white/90 shrink-0 gap-2">
                Get API key <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
