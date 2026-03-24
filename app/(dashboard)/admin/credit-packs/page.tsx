'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Package, Plus, Trash2, Pencil, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)
const emptyForm = { name: '', credits: '', bonus_credits: '0', price_usd: '', is_active: true, sort_order: '0' }

export default function AdminCreditPacksPage() {
  const { data: packs, isLoading } = useSWR('/api/admin/credit-packs', fetcher)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)

  const f = (k: string) => form[k]
  const setF = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true) }
  const openEdit = (p: Record<string, unknown>) => {
    setEditing(p)
    setForm({ name: p.name, credits: String(p.credits), bonus_credits: String(p.bonus_credits || 0), price_usd: String(p.price_usd), is_active: p.is_active, sort_order: String(p.sort_order || 0) })
    setOpen(true)
  }

  const save = async () => {
    if (!String(f('name')).trim() || !f('credits') || !f('price_usd')) { toast.error('Name, credits and price are required'); return }
    setSaving(true)
    try {
      const body = { ...(editing ? { id: editing.id } : {}), name: f('name'), credits: Number(f('credits')), bonus_credits: Number(f('bonus_credits') || 0), price_usd: Number(f('price_usd')), is_active: f('is_active'), sort_order: Number(f('sort_order') || 0) }
      const res = await fetch('/api/admin/credit-packs', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success(editing ? 'Pack updated' : 'Pack created')
      mutate('/api/admin/credit-packs'); setOpen(false)
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this credit pack?')) return
    await fetch(`/api/admin/credit-packs?id=${id}`, { method: 'DELETE' })
    toast.success('Pack deleted'); mutate('/api/admin/credit-packs')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Credit Packs</h1><p className="text-muted-foreground text-sm mt-1">Manage purchasable credit packs shown to users.</p></div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Pack</Button>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(packs || []).map((p: Record<string, unknown>) => {
            const total = Number(p.credits) + Number(p.bonus_credits || 0)
            const perk = total > 0 ? ((Number(p.price_usd) / total) * 1000).toFixed(2) : '?'
            return (
              <Card key={p.id as string}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2"><Package className="w-5 h-5 text-primary" /><span className="font-semibold">{p.name as string}</span></div>
                    {!p.is_active && <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">Inactive</span>}
                  </div>
                  <div>
                    <p className="text-2xl font-bold">${Number(p.price_usd).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground">{total.toLocaleString()} credits {Number(p.bonus_credits) > 0 && `(+${Number(p.bonus_credits).toLocaleString()} bonus)`}</p>
                    <p className="text-xs text-muted-foreground">${perk} per 1k</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                    <Button variant="outline" size="sm" onClick={() => del(p.id as string)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {!packs?.length && <div className="col-span-3 text-center py-12 text-muted-foreground"><Package className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>No credit packs yet.</p></div>}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Pack' : 'New Credit Pack'}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1"><Label>Name</Label><Input value={String(f('name'))} onChange={e => setF('name', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Credits</Label><Input type="number" value={String(f('credits'))} onChange={e => setF('credits', e.target.value)} /></div>
              <div className="space-y-1"><Label>Bonus Credits</Label><Input type="number" value={String(f('bonus_credits'))} onChange={e => setF('bonus_credits', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Price (USD)</Label><Input type="number" step="0.01" value={String(f('price_usd'))} onChange={e => setF('price_usd', e.target.value)} /></div>
              <div className="space-y-1"><Label>Sort Order</Label><Input type="number" value={String(f('sort_order'))} onChange={e => setF('sort_order', e.target.value)} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={f('is_active') as boolean} onCheckedChange={v => setF('is_active', v)} /><Label>Active</Label></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{editing ? 'Save Changes' : 'Create Pack'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
