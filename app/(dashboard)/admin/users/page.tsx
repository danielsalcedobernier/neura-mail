'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Users, Search, Plus, Edit2, Trash2, Coins,
  ToggleLeft, ToggleRight, Loader2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type User = {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  email_verified: boolean
  credits: number
  created_at: string
  plan_name: string | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data?.users ?? [])
const EMPTY_NEW = { email: '', full_name: '', password: '', role: 'client' }

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const key = `/api/admin/users?search=${search}`
  const { data: users, isLoading } = useSWR<User[]>(key, fetcher)

  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [creditsUser, setCreditsUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  const [newUser, setNewUser] = useState(EMPTY_NEW)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditMode, setCreditMode] = useState<'add' | 'remove' | 'set'>('add')
  const [saving, setSaving] = useState(false)

  const refresh = () => mutate(key)

  const createUser = async () => {
    if (!newUser.email || !newUser.password) return toast.error('Email and password are required')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const json = await res.json()
      if (res.ok) { toast.success('User created'); setCreateOpen(false); setNewUser(EMPTY_NEW); refresh() }
      else toast.error(json.error || 'Failed to create user')
    } catch { toast.error('Failed to create user') }
    finally { setSaving(false) }
  }

  const saveEdit = async () => {
    if (!editUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: editUser.full_name, role: editUser.role, is_active: editUser.is_active, email_verified: editUser.email_verified }),
      })
      if (res.ok) { toast.success('User updated'); setEditUser(null); refresh() }
      else { const j = await res.json(); toast.error(j.error || 'Update failed') }
    } catch { toast.error('Update failed') }
    finally { setSaving(false) }
  }

  const toggleActive = async (u: User) => {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    })
    if (res.ok) { toast.success(`User ${!u.is_active ? 'activated' : 'deactivated'}`); refresh() }
    else toast.error('Failed to update status')
  }

  const saveCredits = async () => {
    if (!creditsUser || !creditAmount) return toast.error('Enter an amount')
    const amount = Math.abs(Number(creditAmount))
    if (!amount || isNaN(amount)) return toast.error('Invalid amount')
    setSaving(true)
    try {
      const body: Record<string, number> = {}
      if (creditMode === 'add') body.add_credits = amount
      else if (creditMode === 'remove') body.remove_credits = amount
      else body.set_credits = amount
      const res = await fetch(`/api/admin/users/${creditsUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) { toast.success('Credits updated'); setCreditsUser(null); setCreditAmount(''); refresh() }
      else { const j = await res.json(); toast.error(j.error || 'Failed') }
    } catch { toast.error('Failed') }
    finally { setSaving(false) }
  }

  const confirmDelete = async () => {
    if (!deleteUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, { method: 'DELETE' })
      if (res.ok) { toast.success('User deleted'); setDeleteUser(null); refresh() }
      else { const j = await res.json(); toast.error(j.error || 'Delete failed') }
    } catch { toast.error('Delete failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Users className="h-6 w-6" />Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestiona usuarios, roles y créditos.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Nuevo usuario</Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9 pr-9" placeholder="Buscar por email o nombre..." value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Rol</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Créditos</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Registro</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map(u => (
                  <tr key={u.id} className="border-b border-border hover:bg-muted/30 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{u.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="bg-primary/10 text-primary">{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{Number(u.credits ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.plan_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString('es-CL')}</td>
                    <td className="px-4 py-3">
                      <Badge className={u.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}>
                        {u.is_active ? 'activo' : 'inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditUser({ ...u })}><Edit2 className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setCreditsUser(u); setCreditAmount(''); setCreditMode('add') }}><Coins className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                          {u.is_active ? <ToggleRight className="h-3 w-3 text-green-500" /> : <ToggleLeft className="h-3 w-3 text-muted-foreground" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteUser(u)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users?.length && (
              <div className="text-center py-10 text-sm text-muted-foreground">No se encontraron usuarios</div>
            )}
          </div>
        </Card>
      )}

      {/* CREATE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
            <DialogDescription>El usuario recibirá 1.000 créditos de bienvenida.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5"><Label>Email *</Label><Input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Nombre completo</Label><Input value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Contraseña *</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Cliente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="worker">Worker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createUser} disabled={saving} className="w-full">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Crear usuario</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5"><Label>Email</Label><Input value={editUser.email} disabled /></div>
              <div className="space-y-1.5"><Label>Nombre completo</Label><Input value={editUser.full_name || ''} onChange={e => setEditUser({ ...editUser, full_name: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select value={editUser.role} onValueChange={v => setEditUser({ ...editUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Cliente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="worker">Worker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between py-2">
                <Label>Email verificado</Label>
                <button onClick={() => setEditUser({ ...editUser, email_verified: !editUser.email_verified })} className={`w-10 h-5 rounded-full transition-colors ${editUser.email_verified ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <div className={`h-4 w-4 rounded-full bg-white shadow mx-0.5 transition-transform ${editUser.email_verified ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2">
                <Label>Cuenta activa</Label>
                <button onClick={() => setEditUser({ ...editUser, is_active: !editUser.is_active })} className={`w-10 h-5 rounded-full transition-colors ${editUser.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                  <div className={`h-4 w-4 rounded-full bg-white shadow mx-0.5 transition-transform ${editUser.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <Button onClick={saveEdit} disabled={saving} className="w-full">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Guardar cambios</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CREDITS DIALOG */}
      <Dialog open={!!creditsUser} onOpenChange={(o) => !o && setCreditsUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gestionar créditos</DialogTitle>
            <DialogDescription>{creditsUser?.full_name || creditsUser?.email} — Balance: {Number(creditsUser?.credits ?? 0).toLocaleString()}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Tabs value={creditMode} onValueChange={v => setCreditMode(v as typeof creditMode)}>
              <TabsList className="w-full"><TabsTrigger value="add" className="flex-1">Agregar</TabsTrigger><TabsTrigger value="remove" className="flex-1">Quitar</TabsTrigger><TabsTrigger value="set" className="flex-1">Establecer</TabsTrigger></TabsList>
            </Tabs>
            <div className="space-y-1.5">
              <Label>{creditMode === 'add' ? 'Créditos a agregar' : creditMode === 'remove' ? 'Créditos a quitar' : 'Nuevo balance'}</Label>
              <Input type="number" min={0} value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
            </div>
            {creditMode !== 'set' && creditAmount && (
              <div className="text-xs text-muted-foreground">Nuevo balance: <strong className="text-foreground">{(creditMode === 'add' ? Number(creditsUser?.credits ?? 0) + Math.abs(Number(creditAmount)) : Math.max(0, Number(creditsUser?.credits ?? 0) - Math.abs(Number(creditAmount)))).toLocaleString()}</strong></div>
            )}
            <Button onClick={saveCredits} disabled={saving} className="w-full">{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Aplicar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <Dialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Eliminar usuario</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción desactivará la cuenta de <strong>{deleteUser?.email}</strong>.</p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteUser(null)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={confirmDelete} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
