'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Shield, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const RESTRICTION_TYPES = [
  { value: 'global_send_limit', label: 'Global Send Limit (emails/day)' },
  { value: 'per_user_send_limit', label: 'Per-User Send Limit (emails/day)' },
  { value: 'blocked_domain', label: 'Blocked Domain' },
  { value: 'blocked_keyword', label: 'Blocked Keyword in Subject' },
  { value: 'max_list_size', label: 'Max Email List Size' },
  { value: 'max_smtp_servers', label: 'Max SMTP Servers per User' },
  { value: 'require_verified_list', label: 'Require Verified List for Campaigns' },
]

const typeColor: Record<string, string> = {
  global_send_limit: 'bg-blue-500/10 text-blue-600',
  per_user_send_limit: 'bg-purple-500/10 text-purple-600',
  blocked_domain: 'bg-destructive/10 text-destructive',
  blocked_keyword: 'bg-orange-500/10 text-orange-600',
  max_list_size: 'bg-muted text-muted-foreground',
  max_smtp_servers: 'bg-muted text-muted-foreground',
  require_verified_list: 'bg-yellow-500/10 text-yellow-600',
}

export default function RestrictionsPage() {
  const { data: restrictions, isLoading } = useSWR('/api/admin/restrictions', fetcher)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ type: 'global_send_limit', name: '', value: '', description: '', is_active: true })

  const save = async () => {
    if (!form.name.trim() || !form.value.trim()) { toast.error('Name and value required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success('Restriction added')
      mutate('/api/admin/restrictions')
      setOpen(false)
      setForm({ type: 'global_send_limit', name: '', value: '', description: '', is_active: true })
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Remove restriction?')) return
    await fetch(`/api/admin/restrictions/${id}`, { method: 'DELETE' })
    toast.success('Restriction removed')
    mutate('/api/admin/restrictions')
  }

  const toggle = async (id: string, current: boolean) => {
    await fetch(`/api/admin/restrictions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    })
    mutate('/api/admin/restrictions')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sending Restrictions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Set platform-wide limits and content filters.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Add Restriction</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {(restrictions || []).map((r: Record<string, unknown>) => (
            <Card key={r.id as string} className={!r.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm text-foreground">{r.name as string}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor[r.type as string] || 'bg-muted text-muted-foreground'}`}>
                        {RESTRICTION_TYPES.find(t => t.value === r.type)?.label || r.type as string}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Value: <span className="font-mono text-foreground">{r.value as string}</span></p>
                    {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description as string}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={r.is_active as boolean} onCheckedChange={() => toggle(r.id as string, r.is_active as boolean)} />
                    <Button size="sm" variant="ghost" onClick={() => del(r.id as string)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!restrictions?.length && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
                <Shield className="w-8 h-8 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No restrictions configured</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Restriction</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESTRICTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input placeholder="Daily Send Cap" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Value</Label>
              <Input placeholder="e.g. 10000 or spam.com" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description (optional)</Label>
              <Textarea placeholder="Why this restriction exists..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active immediately</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Add Restriction
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
