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
      const body = {
        ...(editing ? { id: editing.id } : {}),
        name: f('name'),
        credits: Number(f('credits')),
        bonus_credits: Number(f('bonus_credits') || 0),
        price_usd: Number(f('price_usd')),
        is_active: f('is_active'),
        sort_order: Number(f('sort_order') || 0),
      }
      const res = await fetch('/api/admin/credit-packs', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success(editing ? 'Pack updated' : 'Pack created')
      mutate('/api/admin/credit-packs')
      setOpen(false)
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this credit pack?')) return
    await fetch(`/api/admin/credit-packs?id=${id}`, { method: 'DELETE' })
    toast.success('Pack deleted')
    mutate('/api/admin/credit-packs')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Credit Packs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage purchasable credit packs shown to users.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> New Pack</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(packs || []).map((p: Record<string, unknown>) => {
            const total = Number(p.credits) + Number(p.bonus_credits || 0)
            const perk = total > 0 ? ((Number(p.price_usd) / total) * 1000).toFixed(2) : '?'
            return (
              <Card key={p.id as string} className={!p.is_active ? 'opacity-60' : ''}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" />
                      <p className="font-medium text-foreground">{p.name as string}</p>
                      {!p.is_active && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    <p className="text-xl font-bold text-foreground">${Number(p.price_usd).toFixed(2)}</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{total.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">credits</span></p>
                  {Number(p.bonus_credits) > 0 && (
                    <p className="text-xs text-green-600">includes {Number(p.bonus_credits).toLocaleString()} bonus</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">${perk} per 1k · sort: {p.sort_order as number}</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)} className="flex-1">
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del(p.id as string)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {!packs?.length && (
            <Card className="border-dashed col-span-2">
              <CardContent className="flex flex-col items-center justify-center py-14 gap-2">
                <Package className="w-8 h-8 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No credit packs yet. Create the first one.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit Pack' : 'New Credit Pack'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input placeholder="Starter Pack" value={f('name') as string} onChange={e => setF('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Credits</Label>
                <Input type="number" placeholder="5000" value={f('credits') as string} onChange={e => setF('credits', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Bonus Credits</Label>
                <Input type="number" placeholder="0" value={f('bonus_credits') as string} onChange={e => setF('bonus_credits', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Price (USD)</Label>
                <Input type="number" step="0.01" placeholder="9.00" value={f('price_usd') as string} onChange={e => setF('price_usd', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Sort Order</Label>
                <Input type="number" placeholder="0" value={f('sort_order') as string} onChange={e => setF('sort_order', e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={f('is_active') as boolean} onCheckedChange={v => setF('is_active', v)} />
            </div>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              {editing ? 'Save Changes' : 'Create Pack'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
