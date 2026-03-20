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

// ── helpers ───────────────────────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent:       'bg-green-500/10 text-green-600 border-green-500/20',
    failed:     'bg-destructive/10 text-destructive border-destructive/20',
    verified:   'bg-green-500/10 text-green-600 border-green-500/20',
    pending:    'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    unverified: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] ?? map.unverified}`}>
      {status}
    </span>
  )
}

// ── API Keys tab ──────────────────────────────────────────────────────────────
function ApiKeysTab() {
  const { data: keys = [], isLoading } = useSWR('/api/transactional/api-keys', fetcher)
  const [open, setOpen]         = useState(false)
  const [name, setName]         = useState('')
  const [limit, setLimit]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [newKey, setNewKey]     = useState<string | null>(null)
  const [showKey, setShowKey]   = useState(false)

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
    <div className="flex flex-col gap-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'API Keys activas', value: keys.filter((k: Record<string, unknown>) => k.is_active).length, icon: Key },
          { label: 'Enviados hoy', value: keys.reduce((a: number, k: Record<string, unknown>) => a + Number(k.sent_today ?? 0), 0).toLocaleString(), icon: Zap },
          { label: 'Límite diario total', value: keys.reduce((a: number, k: Record<string, unknown>) => a + Number(k.daily_limit ?? 0), 0).toLocaleString() || '∞', icon: BarChart3 },
        ].map(s => (
          <Card key={s.label} className="bg-muted/30 border-border">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{String(s.value)}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New key button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-sm">API Keys</h3>
          <p className="text-xs text-muted-foreground">Usa Bearer token en el header Authorization.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Nueva API Key
        </Button>
      </div>

      {/* Key list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Key className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No tienes API keys. Crea una para empezar.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
          {keys.map((k: Record<string, unknown>) => (
            <div key={k.id as string} className="flex items-center justify-between px-4 py-3 bg-background hover:bg-muted/20 transition-colors">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{k.name as string}</span>
                  {!k.is_active && <Badge variant="secondary" className="text-xs">Inactiva</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-muted-foreground font-mono">{k.key_prefix as string}</code>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {Number(k.sent_today ?? 0).toLocaleString()} enviados hoy
                    {k.daily_limit ? ` / ${Number(k.daily_limit).toLocaleString()} límite` : ''}
                  </span>
                  {k.last_used_at && (
                    <span className="text-xs text-muted-foreground">
                      · último uso {new Date(k.last_used_at as string).toLocaleDateString('es-CL')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="text-xs h-7"
                  onClick={() => toggle(k.id as string, !k.is_active)}>
                  {k.is_active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                  onClick={() => remove(k.id as string)}>
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setNewKey(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva API Key</DialogTitle>
          </DialogHeader>
          {newKey ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex flex-col gap-2">
                <p className="text-sm font-medium text-green-600">API Key creada. Guarda esto ahora — no se vuelve a mostrar.</p>
                <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                  <code className="text-xs font-mono flex-1 truncate">
                    {showKey ? newKey : '•'.repeat(newKey.length)}
                  </code>
                  <button onClick={() => setShowKey(v => !v)} className="text-muted-foreground hover:text-foreground">
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <CopyButton value={newKey} />
                </div>
              </div>
              <Button onClick={() => { setOpen(false); setNewKey(null) }}>Listo</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Nombre</Label>
                  <Input placeholder="ej. Producción" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Límite diario <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="number" placeholder="Sin límite" value={limit} onChange={e => setLimit(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={create} disabled={saving}>
                  {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Crear
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Domains tab ───────────────────────────────────────────────────────────────
function DomainsTab() {
  const { data: domains = [], isLoading } = useSWR('/api/transactional/domains', fetcher)
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding]       = useState(false)
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
    <div className="flex flex-col gap-6">
      {/* Add domain */}
      <div className="flex gap-2">
        <Input placeholder="tudominio.com" value={newDomain} onChange={e => setNewDomain(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} className="max-w-sm" />
        <Button onClick={add} disabled={adding} size="sm">
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
          Agregar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : domains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Globe className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Agrega un dominio para empezar a enviar emails.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {domains.map((d: Record<string, unknown>) => (
            <Card key={d.id as string} className="border-border">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{d.domain as string}</span>
                    <StatusBadge status={d.status as string} />
                  </div>
                  {d.status !== 'verified' && (
                    <Button size="sm" variant="outline" onClick={() => verify(d.id as string)}
                      disabled={verifying === d.id as string}>
                      {verifying === d.id as string
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                      Verificar
                    </Button>
                  )}
                </div>
                {d.status !== 'verified' && (
                  <div className="flex flex-col gap-2 bg-muted/40 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">DNS Records requeridos</p>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { type: 'TXT', name: d.domain as string, value: d.dns_txt_value as string, label: 'Verificación de propiedad' },
                        { type: 'TXT', name: d.domain as string, value: d.spf_record as string, label: 'SPF' },
                      ].map(rec => (
                        <div key={rec.label} className="flex items-start gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{rec.type}</Badge>
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-muted-foreground">{rec.label}</span>
                            <div className="flex items-center gap-1 bg-background rounded px-2 py-1">
                              <code className="font-mono truncate flex-1">{rec.value}</code>
                              <CopyButton value={rec.value} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {d.status === 'verified' && d.verified_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    Verificado el {new Date(d.verified_at as string).toLocaleDateString('es-CL')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Email Logs tab ────────────────────────────────────────────────────────────
function EmailLogsTab() {
  const { data, isLoading } = useSWR('/api/transactional/emails?limit=50', fetcher)
  const emails = data?.emails ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.total ?? 0} emails en total
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Mail className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No hay emails enviados aún.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Para</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Asunto</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Estado</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">API Key</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {emails.map((e: Record<string, unknown>) => (
                <tr key={e.id as string} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs font-mono truncate max-w-[180px]">
                    {(JSON.parse((e.to_emails as string) ?? '[]') as string[]).join(', ')}
                  </td>
                  <td className="px-4 py-2.5 text-xs truncate max-w-[200px]">{e.subject as string}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={e.status as string} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{(e.api_key_name as string) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date((e.created_at as string)).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Quick Start tab ───────────────────────────────────────────────────────────
function QuickStartTab() {
  const code = {
    curl: `curl -X POST https://neuramail.app/api/v1/emails \\
  -H "Authorization: Bearer nm_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "hola@tudominio.com",
    "to": "destinatario@ejemplo.com",
    "subject": "Hola desde NeuraMail",
    "html": "<h1>Hola mundo</h1><p>Este email fue enviado via NeuraMail.</p>"
  }'`,
    node: `import { NeuraMail } from 'neuramail'

const client = new NeuraMail({ apiKey: 'nm_live_YOUR_API_KEY' })

const { id } = await client.emails.send({
  from: 'hola@tudominio.com',
  to: 'destinatario@ejemplo.com',
  subject: 'Hola desde NeuraMail',
  html: '<h1>Hola mundo</h1>',
})

console.log('Email enviado:', id)`,
    python: `import requests

response = requests.post(
    "https://neuramail.app/api/v1/emails",
    headers={
        "Authorization": "Bearer nm_live_YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "from": "hola@tudominio.com",
        "to": "destinatario@ejemplo.com",
        "subject": "Hola desde NeuraMail",
        "html": "<h1>Hola mundo</h1>",
    },
)
print(response.json())  # {"id": "nm_abc123..."}`,
  }

  const [tab, setTab] = useState<keyof typeof code>('curl')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(code[tab])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Steps */}
      {[
        { n: 1, title: 'Crea una API Key', desc: 'Ve a la pestaña "API Keys" y genera una nueva key.', icon: Key },
        { n: 2, title: 'Verifica tu dominio', desc: 'Agrega tu dominio en "Dominios" y configura los DNS records.', icon: Shield },
        { n: 3, title: 'Envía tu primer email', desc: 'Usa la API REST o uno de los SDKs de abajo.', icon: Mail },
      ].map(s => (
        <div key={s.n} className="flex gap-4">
          <div className="flex flex-col items-center gap-1">
            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{s.n}</span>
            </div>
            {s.n < 3 && <div className="w-px flex-1 bg-border" />}
          </div>
          <div className="pb-6">
            <p className="font-medium text-sm">{s.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
          </div>
        </div>
      ))}

      {/* Code block */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(Object.keys(code) as (keyof typeof code)[]).map(k => (
              <button key={k} onClick={() => setTab(k)}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${tab === k ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {k}
              </button>
            ))}
          </div>
          <button onClick={copy} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <pre className="bg-zinc-950 text-zinc-300 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed border border-zinc-800">
          {code[tab]}
        </pre>
      </div>

      {/* Response format */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Respuesta</p>
        <pre className="bg-zinc-950 text-zinc-300 rounded-lg p-4 text-xs font-mono border border-zinc-800">
{`// Exitoso (200)
{ "id": "nm_a1b2c3d4e5f6..." }

// Error (4xx/5xx)
{ "error": "Domain not verified" }`}
        </pre>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DeveloperPage() {
  return (
    <div className="flex flex-col gap-8 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold">NeuraMail API</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Envía emails transaccionales via API usando Amazon SES como infraestructura. Igual que Resend, pero tuyo.
          </p>
        </div>
        <a href="https://neuramail.app/docs/api" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
          Documentación <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Base URL */}
      <div className="flex items-center gap-3 bg-muted/30 border border-border rounded-lg px-4 py-2.5">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Base URL</span>
        <div className="flex items-center gap-2 flex-1">
          <code className="text-xs font-mono text-foreground">https://neuramail.app/api/v1</code>
          <CopyButton value="https://neuramail.app/api/v1" />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          Auth: Bearer token
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="quickstart">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="quickstart" className="gap-1.5">
            <Code2 className="w-3.5 h-3.5" /> Quick Start
          </TabsTrigger>
          <TabsTrigger value="keys" className="gap-1.5">
            <Key className="w-3.5 h-3.5" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="domains" className="gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Dominios
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Email Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quickstart" className="mt-6"><QuickStartTab /></TabsContent>
        <TabsContent value="keys"       className="mt-6"><ApiKeysTab /></TabsContent>
        <TabsContent value="domains"    className="mt-6"><DomainsTab /></TabsContent>
        <TabsContent value="logs"       className="mt-6"><EmailLogsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
