'use client'

import useSWR, { mutate } from 'swr'
import { Key, Copy, RefreshCw, Eye, EyeOff, Loader2, Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const endpointDocs = [
  { method: 'GET', path: '/api/v1/verify?email=test@example.com', desc: 'Verify a single email address' },
  { method: 'POST', path: '/api/v1/verify/bulk', desc: 'Verify multiple emails in one request (max 100)' },
  { method: 'GET', path: '/api/v1/lists', desc: 'List all your email lists' },
  { method: 'GET', path: '/api/v1/credits', desc: 'Get your current credit balance' },
]

const methodColor: Record<string, string> = {
  GET: 'bg-green-500/10 text-green-600',
  POST: 'bg-blue-500/10 text-blue-600',
  DELETE: 'bg-destructive/10 text-destructive',
}

export default function ApiPage() {
  const { data: user } = useSWR('/api/auth/me', fetcher)
  const [showKey, setShowKey] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const copyKey = () => {
    if (!user?.api_key) return
    navigator.clipboard.writeText(user.api_key)
    toast.success('API key copied!')
  }

  const regenerateKey = async () => {
    if (!confirm('This will invalidate your current API key. Continue?')) return
    setRegenerating(true)
    try {
      const res = await fetch('/api/user/regenerate-api-key', { method: 'POST' })
      if (res.ok) { toast.success('New API key generated'); mutate('/api/auth/me') }
      else toast.error('Failed to regenerate')
    } catch { toast.error('Failed to regenerate') }
    finally { setRegenerating(false) }
  }

  const maskedKey = user?.api_key ? `nm_${user.api_key.slice(3, 7)}${'•'.repeat(28)}` : '—'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">API Access</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Use the NeuraMail REST API to verify emails programmatically.</p>
      </div>

      {/* API Key */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" /> Your API Key
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                readOnly
                value={showKey ? (user?.api_key || '') : maskedKey}
                className="font-mono text-sm pr-20"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={copyKey}>
              <Copy className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={regenerateKey} disabled={regenerating}>
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pass this key as the <code className="bg-muted px-1 rounded">x-api-key</code> header or <code className="bg-muted px-1 rounded">api_key</code> query parameter.
          </p>
        </CardContent>
      </Card>

      {/* Quick Start */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Code className="w-4 h-4 text-primary" /> Quick Start
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-md p-4 font-mono text-xs overflow-x-auto">
            <p className="text-muted-foreground mb-1"># Verify a single email</p>
            <p className="text-foreground">curl -H &quot;x-api-key: YOUR_KEY&quot; \</p>
            <p className="text-foreground pl-4">&quot;https://yourdomain.com/api/v1/verify?email=test@example.com&quot;</p>
            <br />
            <p className="text-muted-foreground mb-1"># Bulk verify (JSON body)</p>
            <p className="text-foreground">curl -X POST \</p>
            <p className="text-foreground pl-4">-H &quot;x-api-key: YOUR_KEY&quot; \</p>
            <p className="text-foreground pl-4">-H &quot;Content-Type: application/json&quot; \</p>
            <p className="text-foreground pl-4">-d &apos;{'{'}&#34;emails&#34;:[&#34;a@b.com&#34;,&#34;c@d.com&#34;]{'}'}&apos; \</p>
            <p className="text-foreground pl-4">&quot;https://yourdomain.com/api/v1/verify/bulk&quot;</p>
          </div>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Available Endpoints</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {endpointDocs.map((ep) => (
              <div key={ep.path} className="flex items-center gap-3 px-5 py-3">
                <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium shrink-0 ${methodColor[ep.method]}`}>
                  {ep.method}
                </span>
                <code className="text-xs font-mono text-foreground flex-1">{ep.path}</code>
                <p className="text-xs text-muted-foreground text-right">{ep.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
