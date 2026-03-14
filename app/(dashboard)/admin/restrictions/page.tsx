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

const emptyForm = {
  name: '', domain_pattern: '', max_per_minute: '',
  max_per_hour: '', max_per_day: '', is_active: true, notes: '',
  applies_to: 'all',
}

export default function RestrictionsPage() {
  const { data: restrictions, isLoading } = useSWR('/api/admin/restrictions', fetcher)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)

  const f = (key: string) => form[key]
  const setF = (key: string, val: unknown) => setForm(p => ({ ...p, [key]: val }))

  const save = async () => {
    if (!String(f('name')).trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      const body = {
        name: f('name'),
        description: f('notes') || null,
        domain_pattern: f('domain_pattern') || null,
        max_per_minute: f('max_per_minute') ? Number(f('max_per_minute')) : null,
        max_per_hour: f('max_per_hour') ? Number(f('max_per_hour')) : null,
        max_per_day: f('max_per_day') ? Number(f('max_per_day')) : null,
        is_active: f('is_active'),
        applies_to: f('applies_to') || 'all',
      }
      const res = await fetch('/api/admin/restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success('Restriction added')
      mutate('/api/admin/restrictions')
      setOpen(false)
      setForm(emptyForm)
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Remove restriction?')) return
    const res = await fetch(`/api/admin/restrictions?id=${id}`, { method: 'DELETE' })
    if (res.ok) toast.success('Removed')
    else toast.error('Delete failed')
    mutate('/api/admin/restrictions')
  }

  const toggle = async (id: string, cur: boolean) => {
    await fetch('/api/admin/restrictions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !cur }),
    })
    mutate('/api/admin/restrictions')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sending Restrictions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Define rate limits and domain-level sending rules.</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setOpen(true) }}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Restriction
        </Button>
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
                      {r.provider_name && <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.provider_name as string}</span>}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">{r.applies_to as string}</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                      {r.domain_pattern && <span>Domain: <code className="text-foreground">{r.domain_pattern as string}</code></span>}
                      {r.max_per_minute && <span>{r.max_per_minute as number}/min</span>}
                      {r.max_per_hour && <span>{r.max_per_hour as number}/hr</span>}
                      {r.max_per_day && <span>{r.max_per_day as number}/day</span>}
                      {r.notes && <span className="text-muted-foreground">{r.notes as string}</span>}
                    </div>
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Restriction</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input placeholder="Gmail Rate Limit" value={f('name') as string} onChange={e => setF('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Applies To</Label>
                <Select value={f('applies_to') as string} onValueChange={v => setF('applies_to', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="plan">By Plan</SelectItem>
                    <SelectItem value="user">Specific User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Domain Pattern</Label>
                <Input placeholder="%@gmail.com" value={f('domain_pattern') as string} onChange={e => setF('domain_pattern', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Max/Min</Label>
                <Input type="number" placeholder="60" value={f('max_per_minute') as string} onChange={e => setF('max_per_minute', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Max/Hour</Label>
                <Input type="number" placeholder="1000" value={f('max_per_hour') as string} onChange={e => setF('max_per_hour', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Max/Day</Label>
                <Input type="number" placeholder="10000" value={f('max_per_day') as string} onChange={e => setF('max_per_day', e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={f('notes') as string} onChange={e => setF('notes', e.target.value)} placeholder="Internal note about this restriction..." />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active immediately</Label>
              <Switch checked={f('is_active') as boolean} onCheckedChange={v => setF('is_active', v)} />
            </div>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Add Restriction
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
