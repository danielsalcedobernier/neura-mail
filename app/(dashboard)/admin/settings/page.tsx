'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Settings, Loader2, Save, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? [])

type Connection = {
  id: string; service_name: string; display_name: string; is_active: boolean
  last_test_status: string | null; last_tested_at: string | null; notes: string | null
  credentials: Record<string, string>; extra_config: Record<string, string>
}

function MaskedInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="pr-9 font-mono text-xs"
      />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

export default function AdminSettingsPage() {
  const { data: connections, isLoading } = useSWR<Connection[]>('/api/admin/api-connections', fetcher)
  const [editing, setEditing] = useState<Record<string, Connection>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const getConn = (c: Connection): Connection => editing[c.id] ?? c

  const updateCred = (id: string, key: string, val: string, base: Connection) => {
    const conn = editing[id] ?? { ...base }
    setEditing({ ...editing, [id]: { ...conn, credentials: { ...conn.credentials, [key]: val } } })
  }

  const updateExtra = (id: string, key: string, val: string, base: Connection) => {
    const conn = editing[id] ?? { ...base }
    setEditing({ ...editing, [id]: { ...conn, extra_config: { ...conn.extra_config, [key]: val } } })
  }

  const toggleActive = (id: string, base: Connection) => {
    const conn = editing[id] ?? { ...base }
    setEditing({ ...editing, [id]: { ...conn, is_active: !conn.is_active } })
  }

  const save = async (c: Connection) => {
    const data = getConn(c)
    setSaving(c.id)
    const res = await fetch(`/api/admin/api-connections/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: data.credentials, extra_config: data.extra_config, is_active: data.is_active }),
    })
    setSaving(null)
    if (res.ok) { toast.success(`${c.display_name} saved`); mutate('/api/admin/api-connections') }
    else toast.error('Failed to save')
  }

  const test = async (c: Connection) => {
    setTesting(c.id)
    const res = await fetch(`/api/admin/api-connections/${c.id}/test`, { method: 'POST' })
    setTesting(null)
    if (res.ok) { toast.success(`${c.display_name} connection OK`); mutate('/api/admin/api-connections') }
    else { const j = await res.json(); toast.error(j.error || 'Test failed') }
  }

  if (isLoading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">API Connections & Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure third-party service credentials stored in the database.</p>
      </div>

      <div className="flex flex-col gap-4">
        {(connections ?? []).map((c) => {
          const conn = getConn(c)
          const credKeys = Object.keys(conn.credentials ?? {})
          const extraKeys = Object.keys(conn.extra_config ?? {})

          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="text-sm font-semibold">{c.display_name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">{c.service_name}</p>
                  </div>
                  {c.last_test_status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.last_test_status === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                      {c.last_test_status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Active</Label>
                  <Switch checked={conn.is_active} onCheckedChange={() => toggleActive(c.id, c)} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {credKeys.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Credentials</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {credKeys.map(key => (
                        <div key={key} className="flex flex-col gap-1.5">
                          <Label className="text-xs">{key.replace(/_/g, ' ')}</Label>
                          <MaskedInput
                            value={conn.credentials?.[key] ?? ''}
                            onChange={v => updateCred(c.id, key, v, c)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {extraKeys.length > 0 && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Configuration</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {extraKeys.map(key => (
                          <div key={key} className="flex flex-col gap-1.5">
                            <Label className="text-xs">{key.replace(/_/g, ' ')}</Label>
                            <Input
                              value={conn.extra_config?.[key] ?? ''}
                              onChange={e => updateExtra(c.id, key, e.target.value, c)}
                              className="text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {c.notes && <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">{c.notes}</p>}

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    {c.last_tested_at ? `Last tested: ${new Date(c.last_tested_at).toLocaleString()}` : 'Never tested'}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => test(c)} disabled={testing === c.id}>
                      {testing === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                      Test
                    </Button>
                    <Button size="sm" onClick={() => save(c)} disabled={saving === c.id}>
                      {saving === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                      Save
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {!connections?.length && (
          <div className="py-16 text-center">
            <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">No API connections configured</p>
          </div>
        )}
      </div>
    </div>
  )
}
