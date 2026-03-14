'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Users, Search, Plus, Edit2, Trash2, Coins,
  ToggleLeft, ToggleRight, Loader2, X, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [creditsUser, setCreditsUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  // Form state
  const [newUser, setNewUser] = useState(EMPTY_NEW)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditMode, setCreditMode] = useState<'add' | 'remove' | 'set'>('add')
  const [saving, setSaving] = useState(false)

  const refresh = () => mutate(key)

  /* ── CREATE ─────────────────────────────────────────── */
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
      if (res.ok) {
        toast.success('User created')
        setCreateOpen(false)
        setNewUser(EMPTY_NEW)
        refresh()
      } else {
        toast.error(json.error || 'Failed to create user')
      }
    } catch { toast.error('Failed to create user') }
    finally { setSaving(false) }
  }

  /* ── EDIT ────────────────────────────────────────────── */
  const saveEdit = async () => {
    if (!editUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: editUser.full_name,
          role: editUser.role,
          is_active: editUser.is_active,
          email_verified: editUser.email_verified,
        }),
      })
      if (res.ok) { toast.success('User updated'); setEditUser(null); refresh() }
      else { const j = await res.json(); toast.error(j.error || 'Update failed') }
    } catch { toast.error('Update failed') }
    finally { setSaving(false) }
  }

  /* ── TOGGLE ACTIVE ───────────────────────────────────── */
  const toggleActive = async (u: User) => {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    })
    if (res.ok) { toast.success(`User ${!u.is_active ? 'activated' : 'deactivated'}`); refresh() }
    else toast.error('Failed to update status')
  }

  /* ── CREDITS ─────────────────────────────────────────── */
  const saveCredits = async () => {
    if (!creditsUser || !creditAmount) return toast.error('Enter an amount')
    const amount = Math.abs(Number(creditAmount))
    if (!amount || isNaN(amount)) return toast.error('Invalid amount')
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (creditMode === 'add') body.add_credits = amount
      else if (creditMode === 'remove') body.remove_credits = amount
      else body.set_credits = amount

      const res = await fetch(`/api/admin/users/${creditsUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success('Credits updated')
        setCreditsUser(null)
        setCreditAmount('')
        refresh()
      } else {
        const j = await res.json(); toast.error(j.error || 'Failed')
      }
    } catch { toast.error('Failed') }
    finally { setSaving(false) }
  }

  /* ── DELETE ──────────────────────────────────────────── */
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona usuarios, roles y créditos de la plataforma.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre o email..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Usuario</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Rol</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Créditos</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Registro</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users ?? []).map(u => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{u.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-sm">{Number(u.credits ?? 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{u.plan_name || '—'}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        u.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
                      }`}>
                        {u.is_active ? 'activo' : 'inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" title="Editar" onClick={() => setEditUser({ ...u })}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Ajustar créditos" onClick={() => { setCreditsUser(u); setCreditAmount(''); setCreditMode('add') }}>
                          <Coins className="w-3.5 h-3.5 text-yellow-500" />
                        </Button>
                        <Button size="sm" variant="ghost" title={u.is_active ? 'Desactivar' : 'Activar'} onClick={() => toggleActive(u)}>
                          {u.is_active
                            ? <ToggleRight className="w-4 h-4 text-green-500" />
                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                        </Button>
                        <Button size="sm" variant="ghost" title="Eliminar" onClick={() => setDeleteUser(u)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users?.length && (
              <div className="py-12 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">No se encontraron usuarios</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── CREATE DIALOG ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
            <DialogDescription>El usuario recibirá 1.000 créditos de bienvenida.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Email *</Label>
              <Input type="email" placeholder="usuario@ejemplo.com" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nombre completo</Label>
              <Input placeholder="Juan Pérez" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Contraseña *</Label>
              <Input type="password" placeholder="Mínimo 8 caracteres" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Rol</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Cliente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createUser} disabled={saving} className="mt-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Crear usuario
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          {editUser && (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input value={editUser.email} disabled className="bg-muted text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Nombre completo</Label>
                <Input value={editUser.full_name || ''} onChange={e => setEditUser({ ...editUser, full_name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Rol</Label>
                <Select value={editUser.role} onValueChange={v => setEditUser({ ...editUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Cliente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Email verificado</Label>
                <button
                  onClick={() => setEditUser({ ...editUser, email_verified: !editUser.email_verified })}
                  className={`w-10 h-5 rounded-full transition-colors ${editUser.email_verified ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${editUser.email_verified ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <Label>Cuenta activa</Label>
                <button
                  onClick={() => setEditUser({ ...editUser, is_active: !editUser.is_active })}
                  className={`w-10 h-5 rounded-full transition-colors ${editUser.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${editUser.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <Button onClick={saveEdit} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                Guardar cambios
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── CREDITS DIALOG ── */}
      <Dialog open={!!creditsUser} onOpenChange={() => setCreditsUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Gestionar créditos</DialogTitle>
            <DialogDescription>
              {creditsUser?.full_name || creditsUser?.email} — Balance actual:{' '}
              <span className="font-mono font-semibold">{Number(creditsUser?.credits ?? 0).toLocaleString()}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <Tabs value={creditMode} onValueChange={v => setCreditMode(v as typeof creditMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="add" className="flex-1">Agregar</TabsTrigger>
                <TabsTrigger value="remove" className="flex-1">Quitar</TabsTrigger>
                <TabsTrigger value="set" className="flex-1">Establecer</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-col gap-1.5">
              <Label>
                {creditMode === 'add' && 'Créditos a agregar'}
                {creditMode === 'remove' && 'Créditos a quitar'}
                {creditMode === 'set' && 'Nuevo balance'}
              </Label>
              <Input
                type="number"
                min={0}
                placeholder="Ej: 1000"
                value={creditAmount}
                onChange={e => setCreditAmount(e.target.value)}
              />
              {creditMode !== 'set' && creditAmount && (
                <p className="text-xs text-muted-foreground">
                  Nuevo balance:{' '}
                  <span className="font-mono font-medium">
                    {(creditMode === 'add'
                      ? Number(creditsUser?.credits ?? 0) + Math.abs(Number(creditAmount))
                      : Math.max(0, Number(creditsUser?.credits ?? 0) - Math.abs(Number(creditAmount)))
                    ).toLocaleString()}
                  </span>
                </p>
              )}
            </div>
            <Button onClick={saveCredits} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Aplicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM DIALOG ── */}
      <Dialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> Eliminar usuario
            </DialogTitle>
            <DialogDescription>
              Esta acción desactivará la cuenta de <strong>{deleteUser?.email}</strong> y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteUser(null)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={confirmDelete} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
