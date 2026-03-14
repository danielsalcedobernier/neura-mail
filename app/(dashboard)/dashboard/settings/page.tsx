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
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account preferences</p>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4" />
              Profile
            </CardTitle>
            <CardDescription>Update your display name</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Full Name</Label>
              <Input
                placeholder={user?.full_name || 'Your name'}
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <Button onClick={saveProfile} disabled={savingProfile} className="self-start">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="w-4 h-4" />
              Change Password
            </CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Current Password</Label>
              <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••" />
            </div>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <Label>New Password</Label>
              <Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Confirm New Password</Label>
              <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
            </div>
            <Button onClick={changePassword} disabled={savingPw} className="self-start">
              {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
              Update Password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="font-mono text-xs text-foreground truncate">{user?.id || '—'}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="capitalize text-foreground">{user?.role || '—'}</dd>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="text-foreground">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
