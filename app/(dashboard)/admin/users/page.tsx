'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Users, Search, Plus, Edit2, ToggleLeft, ToggleRight, Loader2, X, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data?.users ?? [])

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const { data: users, isLoading } = useSWR(`/api/admin/users?search=${search}`, fetcher)
  const [editUser, setEditUser] = useState<Record<string, unknown> | null>(null)
  const [editCredits, setEditCredits] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleActive = async (id: string, current: boolean) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    })
    if (res.ok) { toast.success('User status updated'); mutate(`/api/admin/users?search=${search}`) }
    else toast.error('Update failed')
  }

  const saveUser = async () => {
    if (!editUser) return
    setSaving(true)
    try {
      const updates: Record<string, unknown> = {
        full_name: editUser.full_name,
        role: editUser.role,
      }
      if (editCredits !== '') updates.credit_adjustment = Number(editCredits)
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        toast.success('User updated')
        mutate(`/api/admin/users?search=${search}`)
        setEditUser(null)
        setEditCredits('')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Update failed')
      }
    } catch { toast.error('Update failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage all platform users, roles, and credits.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by name or email..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
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
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">User</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Credits</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Joined</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users || []).map((u: Record<string, unknown>) => (
                  <tr key={u.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{u.full_name as string || '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email as string}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {u.role as string}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-sm">{Number(u.credits ?? 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {new Date(u.created_at as string).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                        {u.is_active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => { setEditUser(u); setEditCredits('') }}>
                          <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(u.id as string, u.is_active as boolean)}>
                          {u.is_active
                            ? <ToggleRight className="w-4 h-4 text-green-500" />
                            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
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
                <p className="text-sm text-muted-foreground">No users found</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {editUser && (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input value={editUser.email as string} disabled className="bg-muted" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Full Name</Label>
                <Input value={editUser.full_name as string || ''} onChange={e => setEditUser({ ...editUser, full_name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <Select value={editUser.role as string} onValueChange={v => setEditUser({ ...editUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Adjust Credits (+ or - amount)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1000 or -500"
                  value={editCredits}
                  onChange={e => setEditCredits(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Current balance: {Number(editUser.credits ?? 0).toLocaleString()}</p>
              </div>
              <Button onClick={saveUser} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
