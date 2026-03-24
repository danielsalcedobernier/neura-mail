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
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)
const emptyPack = { name: '', credits: '', bonus_credits: '0', price_usd: '', is_active: true }

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
      const body = { name: form.name, credits: Number(form.credits), bonus_credits: Number(form.bonus_credits || 0), price_usd: Number(form.price_usd), is_active: form.is_active }
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><CreditCard className="h-6 w-6" />Credit Packs</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage verification credit packages for purchase.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New Pack</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {(packs || []).map((p: Record<string, unknown>) => (
            <Card key={p.id as string}>
              <CardContent className="pt-4 pb-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{p.name as string}</span>
                    <span className="text-sm text-muted-foreground">{Number(p.credits).toLocaleString()} credits</span>
                    {Number(p.active_users) > 0 && <Badge className="bg-primary/10 text-primary">{Number(p.active_users)} users</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    ${Number(p.price_usd).toFixed(2)} · ${Number(p.credits) > 0 ? ((Number(p.price_usd) / Number(p.credits)) * 1000).toFixed(3) : '—'} per 1k credits
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge className={p.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Edit2 className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deletePack(p.id as string)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!packs?.length && (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No credit packs yet</CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Pack' : 'New Credit Pack'}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5"><Label>Pack Name</Label><Input value={form.name as string} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Credits</Label><Input type="number" value={form.credits as string} onChange={e => setForm({ ...form, credits: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Bonus Credits</Label><Input type="number" value={form.bonus_credits as string} onChange={e => setForm({ ...form, bonus_credits: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Price (USD)</Label><Input type="number" value={form.price_usd as string} onChange={e => setForm({ ...form, price_usd: e.target.value })} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active as boolean} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label>Active (visible to users)</Label>
            </div>
            <Button onClick={save} disabled={saving} className="w-full">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? 'Update Pack' : 'Create Pack'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
