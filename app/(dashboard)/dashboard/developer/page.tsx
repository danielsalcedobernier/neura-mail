'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { toast } from 'sonner'
import {
  Key, Globe, Mail, Code2, Plus, Trash2, Copy, CheckCircle2,
  AlertCircle, Clock, RefreshCw, Eye, EyeOff, Loader2, ExternalLink,
  Shield, Zap, BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(r => r.data ?? r)

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button size="icon" variant="ghost" onClick={copy} className="h-7 w-7 text-muted-foreground hover:text-foreground">
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: 'bg-green-500/10 text-green-600 border-green-500/20',
    failed: 'bg-destructive/10 text-destructive border-destructive/20',
    verified: 'bg-green-500/10 text-green-600 border-green-500/20',
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    unverified: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] ?? 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  )
}

// ── API Keys Tab ──────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const { data: keys = [], isLoading } = useSWR<Record<string, unknown>[]>('/api/transactional/api-keys', fetcher)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const create = async () => {
    if (!name.trim()) return toast.error('Nombre requerido')
    setSaving(true)
    const res = await fetch('/api/transactional/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, daily_limit: limit ? Number(limit) : null }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) return toast.error(json.error)
    setNewKey(json.data?.key ?? json.key)
    mutate('/api/transactional/api-keys')
    setName('')
    setLimit('')
  }

  const remove = async (id: string) => {
    await fetch(`/api/transactional/api-keys/${id}`, { method: 'DELETE' })
    mutate('/api/transactional/api-keys')
    toast.success('API key eliminada')
  }

  const toggle = async (id: string, is_active: boolean) => {
    await fetch(`/api/transactional/api-keys/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    mutate('/api/transactional/api-keys')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'API Keys activas', value: keys.filter(k => k.is_active).length, icon: Key },
          { label: 'Enviados hoy', value: keys.reduce((a, k) => a + Number(k.sent_today ?? 0), 0).toLocaleString(), icon: Zap },
          { label: 'Límite diario total', value: keys.reduce((a, k) => a + Number(k.daily_limit ?? 0), 0).toLocaleString() || '∞', icon: BarChart3 },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <s.icon className="h-4 w-4 mb-2 text-muted-foreground" />
              <div className="text-xl font-bold">{String(s.value)}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm">API Keys</CardTitle>
            <CardDescription className="text-xs">Usa Bearer token en el header Authorization.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />Nueva API Key
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No tienes API keys. Crea una para empezar.</div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id as string} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{k.name as string}</span>
                      {!k.is_active && <Badge className="bg-muted text-muted-foreground text-xs">Inactiva</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {k.key_prefix as string} · {Number(k.sent_today ?? 0).toLocaleString()} enviados hoy
                      {k.daily_limit ? ` / ${Number(k.daily_limit).toLocaleString()} límite` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggle(k.id as string, !k.is_active)}>
                      {k.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(k.id as string)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setNewKey(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva API Key</DialogTitle></DialogHeader>
          {newKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">API Key creada. Guarda esto ahora — no se vuelve a mostrar.</p>
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 font-mono text-sm">
                <span className="flex-1 break-all">{showKey ? newKey : '•'.repeat(Math.min(newKey.length, 40))}</span>
                <button onClick={() => setShowKey(v => !v)} className="text-muted-foreground hover:text-foreground">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <CopyButton value={newKey} />
              </div>
              <DialogFooter>
                <Button onClick={() => { setOpen(false); setNewKey(null) }}>Listo</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Límite diario (opcional)</Label><Input type="number" value={limit} onChange={e => setLimit(e.target.value)} /></div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={create} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Crear</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Domains Tab ───────────────────────────────────────────────────────────────
function DomainsTab() {
  const { data: domains = [], isLoading } = useSWR<Record<string, unknown>[]>('/api/transactional/domains', fetcher)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)

  const add = async () => {
    if (!newDomain.trim()) return
    setAdding(true)
    const res = await fetch('/api/transactional/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: newDomain }),
    })
    setAdding(false)
    const json = await res.json()
    if (!res.ok) return toast.error(json.error)
    mutate('/api/transactional/domains')
    setNewDomain('')
    toast.success('Dominio agregado. Configura el DNS y luego verifica.')
  }

  const verify = async (id: string) => {
    setVerifying(id)
    const res = await fetch('/api/transactional/domains', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain_id: id }),
    })
    const json = await res.json()
    setVerifying(null)
    mutate('/api/transactional/domains')
    if (json.data?.verified) toast.success('Dominio verificado')
    else toast.info(json.data?.message ?? 'Verificación fallida')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="tudominio.com"
          value={newDomain}
          onChange={e => setNewDomain(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          className="max-w-sm"
        />
        <Button onClick={add} disabled={adding}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : domains.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
          Agrega un dominio para empezar a enviar emails.
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map(d => (
            <Card key={d.id as string}>
              <CardContent className="pt-4 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{d.domain as string}</span>
                    <StatusBadge status={d.status as string} />
                  </div>
                  {d.status !== 'verified' && (
                    <Button size="sm" variant="outline" onClick={() => verify(d.id as string)} disabled={verifying === d.id}>
                      {verifying === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Verificar
                    </Button>
                  )}
                </div>
                {d.status !== 'verified' && (
                  <div className="space-y-2 text-xs">
                    <p className="font-medium text-muted-foreground">DNS Records requeridos</p>
                    {[
                      { type: 'TXT', label: 'Verificación de propiedad', value: d.dns_txt_value as string },
                      { type: 'TXT', label: 'SPF', value: d.spf_record as string },
                    ].map(rec => (
                      <div key={rec.label} className="flex items-start gap-2 bg-muted/50 rounded p-2">
                        <Badge className="bg-primary/10 text-primary shrink-0">{rec.type}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-muted-foreground">{rec.label}</p>
                          <p className="font-mono break-all text-foreground">{rec.value}</p>
                        </div>
                        <CopyButton value={rec.value} />
                      </div>
                    ))}
                  </div>
                )}
                {d.status === 'verified' && d.verified_at && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    Verificado el {new Date(d.verified_at as string).toLocaleDateString('es-CL')}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Email Logs Tab ────────────────────────────────────────────────────────────
function EmailLogsTab() {
  const { data, isLoading } = useSWR('/api/transactional/emails?limit=50', fetcher)
  const emails = (data?.emails ?? []) as Record<string, unknown>[]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="h-4 w-4" />
        {data?.total ?? 0} emails en total
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : emails.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No hay emails enviados aún.
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Para</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Asunto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">API Key</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {emails.map(e => (
                  <tr key={e.id as string} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs font-mono truncate max-w-[150px]">
                      {(JSON.parse((e.to_emails as string) ?? '[]') as string[]).join(', ')}
                    </td>
                    <td className="px-4 py-3 truncate max-w-[180px]">{e.subject as string}</td>
                    <td className="px-4 py-3"><StatusBadge status={e.status as string} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{(e.api_key_name as string) ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(e.created_at as string).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Quick Start Tab ───────────────────────────────────────────────────────────
function QuickStartTab() {
  const code: Record<string, string> = {
    curl: `curl -X POST https://neuramail.app/api/v1/emails \\
  -H "Authorization: Bearer nm_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "hola@tudominio.com",
    "to": "destinatario@ejemplo.com",
    "subject": "Hola desde NeuraMail",
    "html": "<h1>Hola mundo</h1>"
  }'`,
    node: `import { NeuraMail } from 'neuramail'

const client = new NeuraMail({ apiKey: 'nm_live_YOUR_API_KEY' })

const { id } = await client.emails.send({
  from: 'hola@tudominio.com',
  to: 'destinatario@ejemplo.com',
  subject: 'Hola desde NeuraMail',
  html: '<h1>Hola mundo</h1>',
})`,
    python: `import requests

response = requests.post(
  "https://neuramail.app/api/v1/emails",
  headers={"Authorization": "Bearer nm_live_YOUR_API_KEY"},
  json={
    "from": "hola@tudominio.com",
    "to": "destinatario@ejemplo.com",
    "subject": "Hola desde NeuraMail",
    "html": "<h1>Hola mundo</h1>",
  },
)
print(response.json())`,
  }

  const [tab, setTab] = useState<keyof typeof code>('curl')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(code[tab])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { n: 1, title: 'Crea una API Key', desc: 'Ve a la pestaña "API Keys" y genera una nueva key.', icon: Key },
          { n: 2, title: 'Verifica tu dominio', desc: 'Agrega tu dominio en "Dominios" y configura los DNS records.', icon: Shield },
          { n: 3, title: 'Envía tu primer email', desc: 'Usa la API REST o uno de los SDKs de abajo.', icon: Mail },
        ].map(s => (
          <Card key={s.n}>
            <CardContent className="pt-4 pb-3 flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{s.n}</div>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {(Object.keys(code) as (keyof typeof code)[]).map(k => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                >
                  {k}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={copy} className="gap-1.5 text-xs">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-foreground">{code[tab]}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Respuesta</p>
          <pre className="bg-muted rounded-lg p-3 text-xs font-mono text-foreground">{`// Exitoso (200)
{ "id": "nm_a1b2c3d4e5f6..." }

// Error (4xx/5xx)
{ "error": "Domain not verified" }`}</pre>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DeveloperPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Code2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">NeuraMail API</h1>
            <p className="text-sm text-muted-foreground">Envía emails transaccionales via API usando Amazon SES como infraestructura.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href="https://neuramail.app/docs" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />Documentación
          </a>
        </Button>
      </div>

      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
        <code className="text-xs font-mono text-foreground">Base URL: https://neuramail.app/api/v1</code>
        <CopyButton value="https://neuramail.app/api/v1" />
        <span className="ml-auto text-xs text-muted-foreground">Auth: Bearer token</span>
      </div>

      <Tabs defaultValue="quickstart">
        <TabsList>
          <TabsTrigger value="quickstart">Quick Start</TabsTrigger>
          <TabsTrigger value="keys">API Keys</TabsTrigger>
          <TabsTrigger value="domains">Dominios</TabsTrigger>
          <TabsTrigger value="logs">Email Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="quickstart" className="mt-4"><QuickStartTab /></TabsContent>
        <TabsContent value="keys" className="mt-4"><ApiKeysTab /></TabsContent>
        <TabsContent value="domains" className="mt-4"><DomainsTab /></TabsContent>
        <TabsContent value="logs" className="mt-4"><EmailLogsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
