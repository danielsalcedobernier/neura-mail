'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Database, Plus, Edit2, Trash2, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const SERVICE_TYPES = [
  { value: 'mails_so', label: 'mails.so (Email Verification)' },
  { value: 'cloudflare_r2', label: 'Cloudflare R2 (File Storage)' },
  { value: 'openai', label: 'OpenAI (AI Content)' },
  { value: 'paypal', label: 'PayPal (Payments)' },
]

const SERVICE_FIELDS: Record<string, { key: string; label: string; secret?: boolean }[]> = {
  mails_so: [
    { key: 'api_key', label: 'API Key', secret: true },
  ],
  cloudflare_r2: [
    { key: 'access_key_id', label: 'Access Key ID', secret: false },
    { key: 'secret_access_key', label: 'Secret Access Key', secret: true },
    { key: 'bucket_name', label: 'Bucket Name', secret: false },
    { key: 'public_url', label: 'Public URL', secret: false },
  ],
  openai: [
    { key: 'api_key', label: 'API Key', secret: true },
  ],
  paypal: [
    { key: 'client_id', label: 'Client ID', secret: false },
    { key: 'client_secret', label: 'Client Secret', secret: true },
  ],
}

const SERVICE_EXTRA: Record<string, { key: string; label: string; default?: string }[]> = {
  mails_so: [
    { key: 'base_url', label: 'Base URL', default: 'https://api.mails.so/v1' },
    { key: 'batch_size', label: 'Batch Size', default: '100' },
  ],
  cloudflare_r2: [
    { key: 'endpoint', label: 'Endpoint URL' },
  ],
}

export default function ApiConnectionsPage() {
  const { data: connections, isLoading } = useSWR('/api/admin/api-connections', fetcher)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [serviceType, setServiceType] = useState('mails_so')
  const [name, setName] = useState('')
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const openNew = () => {
    setEditing(null); setServiceType('mails_so'); setName(''); setCreds({}); setExtra({}); setIsActive(true); setOpen(true)
  }
  const openEdit = (c: Record<string, unknown>) => {
    setEditing(c); setServiceType(c.service_name as string); setName(c.name as string)
    setCreds((c.credentials as Record<string, string>) || {})
    setExtra((c.extra_config as Record<string, string>) || {})
    setIsActive(c.is_active as boolean)
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = { name: name || serviceType, service_name: serviceType, credentials: creds, extra_config: extra, is_active: isActive }
      const url = editing ? `/api/admin/api-connections/${editing.id}` : '/api/admin/api-connections'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success(editing ? 'Connection updated' : 'Connection added')
      mutate('/api/admin/api-connections')
      setOpen(false)
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Remove this API connection?')) return
    await fetch(`/api/admin/api-connections/${id}`, { method: 'DELETE' })
    toast.success('Removed')
    mutate('/api/admin/api-connections')
  }

  const fields = SERVICE_FIELDS[serviceType] || []
  const extraFields = SERVICE_EXTRA[serviceType] || []

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">API Connections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure third-party API credentials (stored encrypted).</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> Add Connection</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {(connections || []).map((c: Record<string, unknown>) => (
            <Card key={c.id as string}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Database className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm text-foreground">{c.name as string}</p>
                      {c.is_active ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{SERVICE_TYPES.find(s => s.value === c.service_name)?.label || c.service_name as string}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => del(c.id as string)}><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!connections?.length && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                <Database className="w-8 h-8 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No API connections configured</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Connection' : 'Add API Connection'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Service Type</Label>
              <Select value={serviceType} onValueChange={v => { setServiceType(v); setCreds({}); setExtra({}) }} disabled={!!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Display Name</Label>
              <Input placeholder={serviceType} value={name} onChange={e => setName(e.target.value)} />
            </div>
            {fields.map(f => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label>{f.label}</Label>
                <Input
                  type={f.secret ? 'password' : 'text'}
                  value={creds[f.key] || ''}
                  onChange={e => setCreds({ ...creds, [f.key]: e.target.value })}
                  placeholder={editing && creds[f.key] ? '(unchanged)' : ''}
                />
              </div>
            ))}
            {extraFields.map(f => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={extra[f.key] || f.default || ''}
                  onChange={e => setExtra({ ...extra, [f.key]: e.target.value })}
                  placeholder={f.default}
                />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {editing ? 'Update' : 'Add Connection'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
