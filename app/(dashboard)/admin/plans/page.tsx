'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Plus, Edit2, Trash2, CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const emptyPack = {
  name: '', credits: '', bonus_credits: '0', price_usd: '', is_active: true,
}

export default function AdminPlansPage() {
  const { data: packs, isLoading } = useSWR('/api/admin/plans', fetcher)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(emptyPack)
  const [saving, setSaving] = useState(false)

  const openNew = () => { setEditing(null); setForm(emptyPack); setOpen(true) }
  const openEdit = (p: Record<string, unknown>) => {
    setEditing(p)
    setForm({ name: p.name, credits: String(p.credits), bonus_credits: String(p.bonus_credits), price_usd: String(p.price_usd), is_active: p.is_active })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name || !form.credits || !form.price_usd) { toast.error('Fill in all required fields'); return }
    setSaving(true)
    try {
      const body = {
        name: form.name,
        credits_included: Number(form.credits),
        price_usd: Number(form.price_usd),
        is_active: form.is_active,
      }
      const url = editing ? `/api/admin/plans/${editing.id}` : '/api/admin/plans'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success(editing ? 'Pack updated' : 'Pack created')
    mutate('/api/admin/plans')
    setOpen(false)
  } catch { toast.error('Save failed') }
  finally { setSaving(false) }
  }

  const deletePack = async (id: string) => {
    if (!confirm('Delete this plan?')) return
    await fetch(`/api/admin/plans/${id}`, { method: 'DELETE' })
    toast.success('Plan deleted')
    mutate('/api/admin/plans')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Credit Packs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage verification credit packages available for purchase.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> New Pack</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(packs || []).map((p: Record<string, unknown>) => (
            <Card key={p.id as string} className={!p.is_active ? 'opacity-50' : ''}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-foreground">{p.name as string}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{Number(p.credits_included).toLocaleString()}</p>
                    {Number(p.active_users) > 0 && (
                      <p className="text-xs text-blue-600">{Number(p.active_users)} active users</p>
                    )}
                  </div>
                  <p className="text-xl font-bold text-primary">${Number(p.price_usd).toFixed(2)}</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  ${(Number(p.credits_included) > 0 ? ((Number(p.price_usd) / Number(p.credits_included)) * 1000).toFixed(3) : '—')} / 1k credits
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => deletePack(p.id as string)}><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!packs?.length && (
            <div className="col-span-3 py-12 text-center">
              <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No credit packs yet</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Pack' : 'New Credit Pack'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Pack Name</Label>
              <Input placeholder="Starter Pack" value={form.name as string} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Credits</Label>
                <Input type="number" placeholder="1000" value={form.credits as string} onChange={e => setForm({ ...form, credits: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Bonus Credits</Label>
                <Input type="number" placeholder="0" value={form.bonus_credits as string} onChange={e => setForm({ ...form, bonus_credits: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Price (USD)</Label>
              <Input type="number" step="0.01" placeholder="9.99" value={form.price_usd as string} onChange={e => setForm({ ...form, price_usd: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active (visible to users)</Label>
              <Switch checked={form.is_active as boolean} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {editing ? 'Update Pack' : 'Create Pack'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
