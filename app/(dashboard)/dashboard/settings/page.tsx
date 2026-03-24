'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { User, Lock, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

export default function SettingsPage() {
  const { data: user } = useSWR('/api/auth/me', fetcher)
  const [name, setName] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const saveProfile = async () => {
    setSavingProfile(true)
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: name || user?.full_name }),
    })
    const json = await res.json()
    if (!res.ok) toast.error(json.error || 'Failed to save')
    else { toast.success('Profile updated'); mutate('/api/auth/me') }
    setSavingProfile(false)
  }

  const changePassword = async () => {
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return }
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setSavingPw(true)
    const res = await fetch('/api/user/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    })
    const json = await res.json()
    if (!res.ok) toast.error(json.error || 'Failed to change password')
    else { toast.success('Password updated'); setCurrentPw(''); setNewPw(''); setConfirmPw('') }
    setSavingPw(false)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">Administra las preferencias de tu cuenta</p>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4" />
              Perfil
            </CardTitle>
            <CardDescription>Actualiza tu nombre de usuario</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">El email no puede cambiarse</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nombre completo</Label>
              <Input
                placeholder={user?.full_name || 'Tu nombre'}
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <Button onClick={saveProfile} disabled={savingProfile} className="self-start">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar perfil
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="w-4 h-4" />
              Cambiar contraseña
            </CardTitle>
            <CardDescription>Actualiza la contraseña de tu cuenta</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Contraseña actual</Label>
              <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" />
            </div>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <Label>Nueva contraseña</Label>
              <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Confirmar nueva contraseña</Label>
              <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repite la nueva contraseña" />
            </div>
            <Button onClick={changePassword} disabled={savingPw} className="self-start">
              {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
              Actualizar contraseña
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información de la cuenta</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">ID de cuenta</dt>
              <dd className="font-mono text-xs text-foreground truncate">{user?.id || '—'}</dd>
              <dt className="text-muted-foreground">Rol</dt>
              <dd className="capitalize text-foreground">{{ client: 'cliente', admin: 'administrador' }[user?.role as string] || user?.role || '—'}</dd>
              <dt className="text-muted-foreground">Miembro desde</dt>
              <dd className="text-foreground">{user?.created_at ? new Date(user.created_at).toLocaleDateString('es-CL') : '—'}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
