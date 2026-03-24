'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Server, Plus, Trash2, Edit2, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-500/10 text-green-600 border-green-500/20',
  provisioning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  active: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  suspended: 'bg-red-500/10 text-red-600 border-red-500/20',
  decommissioned: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

interface DedicatedServer {
  id: string
  name: string
  hostname?: string
  ip_address?: string
  monthly_price: number
  status: string
  user_id?: string
  user_email?: string
  specs?: Record<string, unknown>
  provisioned_at?: string
  expires_at?: string
}

const empty: Partial<DedicatedServer> = { name: '', hostname: '', monthly_price: 99, status: 'available' }

export default function AdminServersPage() {
  const { data: servers, isLoading } = useSWR('/api/admin/servers', fetcher)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<DedicatedServer | null>(null)
  const [form, setForm] = useState<Partial<DedicatedServer>>(empty)
  const [saving, setSaving] = useState(false)

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true) }
  const openEdit = (s: DedicatedServer) => { setEditing(s); setForm(s); setOpen(true) }

  const save = async () => {
    setSaving(true)
    try {
      const url = editing ? `/api/admin/servers/${editing.id}` : '/api/admin/servers'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      toast.success(editing ? 'Server updated' : 'Server created')
      mutate('/api/admin/servers')
      setOpen(false)
    } finally { setSaving(false) }
  }

  const deleteServer = async (id: string) => {
    if (!confirm('Delete this server?')) return
    await fetch(`/api/admin/servers/${id}`, { method: 'DELETE' })
    toast.success('Server deleted')
    mutate('/api/admin/servers')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dedicated Servers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage servers available for clients</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Server
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (servers || []).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Server className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No dedicated servers yet. Add the first one.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(servers || []).map((s: DedicatedServer) => (
            <div key={s.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Server className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.hostname || s.ip_address || 'No hostname'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-foreground">${Number(s.monthly_price).toFixed(2)}/mo</p>
                  {s.user_email && <p className="text-xs text-muted-foreground">{s.user_email}</p>}
                </div>
                <Badge className={`text-xs border ${STATUS_COLORS[s.status] || ''}`} variant="outline">
                  {s.status}
                </Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteServer(s.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Server' : 'Add Dedicated Server'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. US-East-01" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Hostname</Label>
                <Input value={form.hostname || ''} onChange={e => setForm({ ...form, hostname: e.target.value })} placeholder="mail.example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Monthly Price (USD)</Label>
                <Input type="number" value={form.monthly_price || ''} onChange={e => setForm({ ...form, monthly_price: Number(e.target.value) })} placeholder="99.00" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={form.status || 'available'} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['available', 'provisioning', 'active', 'suspended', 'decommissioned'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Server'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
