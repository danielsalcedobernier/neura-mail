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
const emptyForm = { name: '', domain_pattern: '', max_per_minute: '', max_per_hour: '', max_per_day: '', is_active: true, notes: '', applies_to: 'all' }

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
      const body = { name: f('name'), description: f('notes') || null, domain_pattern: f('domain_pattern') || null, max_per_minute: f('max_per_minute') ? Number(f('max_per_minute')) : null, max_per_hour: f('max_per_hour') ? Number(f('max_per_hour')) : null, max_per_day: f('max_per_day') ? Number(f('max_per_day')) : null, is_active: f('is_active'), applies_to: f('applies_to') || 'all' }
      const res = await fetch('/api/admin/restrictions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success('Restriction added'); mutate('/api/admin/restrictions'); setOpen(false); setForm(emptyForm)
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Remove restriction?')) return
    const res = await fetch(`/api/admin/restrictions?id=${id}`, { method: 'DELETE' })
    if (res.ok) toast.success('Removed'); else toast.error('Delete failed')
    mutate('/api/admin/restrictions')
  }

  const toggle = async (id: string, cur: boolean) => {
    await fetch('/api/admin/restrictions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: !cur }) })
    mutate('/api/admin/restrictions')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sending Restrictions</h1><p className="text-muted-foreground text-sm mt-1">Define rate limits and domain-level sending rules.</p></div>
        <Button onClick={() => { setForm(emptyForm); setOpen(true) }}><Plus className="w-4 h-4 mr-2" />Add Restriction</Button>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-3">
          {(restrictions || []).map((r: Record<string, unknown>) => (
            <Card key={r.id as string}>
              <CardContent className="p-4 flex items-center gap-4">
                <Shield className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name as string}</span>
                    {r.provider_name && <span className="text-xs border rounded px-1.5 py-0.5">{r.provider_name as string}</span>}
                    <span className="text-xs text-muted-foreground">{r.applies_to as string}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {r.domain_pattern && <span>Domain: {r.domain_pattern as string}</span>}
                    {r.max_per_minute && <span>{r.max_per_minute as number}/min</span>}
                    {r.max_per_hour && <span>{r.max_per_hour as number}/hr</span>}
                    {r.max_per_day && <span>{r.max_per_day as number}/day</span>}
                    {r.notes && <span className="italic">{r.notes as string}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={r.is_active as boolean} onCheckedChange={() => toggle(r.id as string, r.is_active as boolean)} />
                  <Button variant="ghost" size="icon" onClick={() => del(r.id as string)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!restrictions?.length && <div className="text-center py-12 text-muted-foreground"><Shield className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>No restrictions configured</p></div>}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Restriction</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1"><Label>Name</Label><Input value={String(f('name'))} onChange={e => setF('name', e.target.value)} /></div>
            <div className="space-y-1"><Label>Applies To</Label><Select value={String(f('applies_to'))} onValueChange={v => setF('applies_to', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Users</SelectItem><SelectItem value="plan">By Plan</SelectItem><SelectItem value="user">Specific User</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Domain Pattern</Label><Input value={String(f('domain_pattern'))} onChange={e => setF('domain_pattern', e.target.value)} placeholder="gmail.com" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>Max/Min</Label><Input type="number" value={String(f('max_per_minute'))} onChange={e => setF('max_per_minute', e.target.value)} /></div>
              <div className="space-y-1"><Label>Max/Hour</Label><Input type="number" value={String(f('max_per_hour'))} onChange={e => setF('max_per_hour', e.target.value)} /></div>
              <div className="space-y-1"><Label>Max/Day</Label><Input type="number" value={String(f('max_per_day'))} onChange={e => setF('max_per_day', e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={String(f('notes'))} onChange={e => setF('notes', e.target.value)} rows={2} /></div>
            <div className="flex items-center gap-2"><Switch checked={f('is_active') as boolean} onCheckedChange={v => setF('is_active', v)} /><Label>Active immediately</Label></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Add Restriction</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
