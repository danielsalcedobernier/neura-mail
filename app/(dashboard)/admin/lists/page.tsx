'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  FileText, Search, Loader2, RefreshCw, CheckCircle2, XCircle, HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type AdminList = {
  id: string
  name: string
  status: string
  valid_count: number
  invalid_count: number
  unverified_count: number
  total_count: number
  verified_at: string | null
  created_at: string
  user_email: string
  user_name: string | null
  completed_job_id: string | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? [])

export default function AdminListsPage() {
  const [search, setSearch] = useState('')
  const key = `/api/admin/lists?search=${search}`
  const { data: lists, isLoading } = useSWR<AdminList[]>(key, fetcher, { refreshInterval: 10000 })

  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)

  const syncList = async (list: AdminList) => {
    if (!list.completed_job_id) {
      toast.error('No hay job completado para esta lista')
      return
    }
    setSyncingId(list.id)
    try {
      const res = await fetch('/api/admin/sync-list-counters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: list.id, jobId: list.completed_job_id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al sincronizar'); return }
      toast.success(`"${list.name}" sincronizada — ${data.data?.updated ?? 0} contactos actualizados`)
      mutate(key)
    } catch { toast.error('Error al sincronizar') }
    finally { setSyncingId(null) }
  }

  const syncAll = async () => {
    const pending = (lists ?? []).filter(l => l.completed_job_id)
    if (pending.length === 0) { toast.info('No hay listas con jobs completados'); return }
    setSyncingAll(true)
    let synced = 0
    for (const list of pending) {
      try {
        const res = await fetch('/api/admin/sync-list-counters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId: list.id, jobId: list.completed_job_id }),
        })
        if (res.ok) synced++
      } catch { /* continue */ }
    }
    toast.success(`${synced}/${pending.length} listas sincronizadas`)
    mutate(key)
    setSyncingAll(false)
  }

  const needsSync = (list: AdminList) =>
    !!list.completed_job_id && list.valid_count === 0 && list.invalid_count === 0 && list.unverified_count > 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Listas de email</h1>
          <p className="text-sm text-muted-foreground">Todas las listas de todos los usuarios</p>
        </div>
        <Button variant="outline" onClick={syncAll} disabled={syncingAll || isLoading}>
          {syncingAll
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <RefreshCw className="w-4 h-4 mr-2" />}
          Sincronizar todas
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por lista o usuario..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {(lists ?? []).map(list => (
            <Card key={list.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{list.name}</span>
                      <Badge variant="outline" className="text-xs">{list.status}</Badge>
                      {needsSync(list) && (
                        <Badge variant="destructive" className="text-xs">Sin sincronizar</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {list.user_name ?? list.user_email} · {list.user_email}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                      <span className="text-muted-foreground">
                        {Number(list.total_count ?? 0).toLocaleString('es-CL')} total
                      </span>
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {Number(list.valid_count ?? 0).toLocaleString('es-CL')} válidos
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <XCircle className="w-3.5 h-3.5" />
                        {Number(list.invalid_count ?? 0).toLocaleString('es-CL')} inválidos
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                        {Number(list.unverified_count ?? 0).toLocaleString('es-CL')} sin verificar
                      </span>
                    </div>
                    {list.verified_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Verificada: {new Date(list.verified_at).toLocaleString('es-CL')}
                      </p>
                    )}
                  </div>
                </div>

                {list.completed_job_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncList(list)}
                    disabled={syncingId === list.id}
                    className="shrink-0"
                  >
                    {syncingId === list.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
            </Card>
          ))}

          {!isLoading && (lists ?? []).length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              No se encontraron listas
            </div>
          )}
        </div>
      )}
    </div>
  )
}
