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
      const res = await fetch('/api/user/api-key', { method: 'POST' })
      if (res.ok) { toast.success('New API key generated'); mutate('/api/auth/me') }
      else toast.error('Failed to regenerate')
    } catch { toast.error('Failed to regenerate') }
    finally { setRegenerating(false) }
  }

  const maskedKey = user?.api_key ? `nm_${user.api_key.slice(3, 7)}${'•'.repeat(28)}` : '—'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API Access</h1>
        <p className="text-muted-foreground text-sm mt-1">Use the NeuraMail REST API to verify emails programmatically.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Your API Key</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={showKey ? (user?.api_key || '—') : maskedKey}
              className="font-mono text-sm"
            />
            <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={copyKey} disabled={!user?.api_key}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={regenerateKey} disabled={regenerating}>
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pass this key as the <code className="bg-muted px-1 rounded">x-api-key</code> header or <code className="bg-muted px-1 rounded">api_key</code> query parameter.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Quick Start</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-xs overflow-x-auto leading-relaxed font-mono">
            {`# Verify a single email\ncurl -H "x-api-key: YOUR_KEY" \\\n  "https://yourdomain.com/api/v1/verify?email=test@example.com"\n\n# Bulk verify (JSON body)\ncurl -X POST \\\n  -H "x-api-key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"emails":["a@b.com","c@d.com"]}' \\\n  "https://yourdomain.com/api/v1/verify/bulk"`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Endpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {endpointDocs.map((ep) => (
            <div key={ep.path} className="flex items-start gap-3">
              <span className={`text-xs font-mono px-2 py-0.5 rounded shrink-0 mt-0.5 ${methodColor[ep.method] || ''}`}>{ep.method}</span>
              <div>
                <p className="font-mono text-xs">{ep.path}</p>
                <p className="text-xs text-muted-foreground">{ep.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
