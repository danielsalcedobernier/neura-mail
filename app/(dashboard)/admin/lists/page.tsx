'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { FileText, Search, Loader2, RefreshCw, CheckCircle2, XCircle, HelpCircle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type AdminList = {
  id: string; name: string; status: string; valid_count: number; invalid_count: number
  unverified_count: number; total_count: number; verified_at: string | null; created_at: string
  user_email: string; user_name: string | null; completed_job_id: string | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? [])

export default function AdminListsPage() {
  const [search, setSearch] = useState('')
  const key = `/api/admin/lists?search=${search}`
  const { data: lists, isLoading } = useSWR<AdminList[]>(key, fetcher, { refreshInterval: 10000 })
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const downloadList = async (list: AdminList, validatedOnly: boolean) => {
    setDownloadingId(list.id); toast.info(`Preparando descarga de "${list.name}"...`)
    try {
      const countRes = await fetch(`/api/admin/lists/export?action=count&listId=${list.id}&validatedOnly=${validatedOnly}`)
      const countData = await countRes.json()
      const total = Number(countData.data?.count ?? 0)
      if (total === 0) { toast.error('No hay registros para descargar'); return }
      let offset = 0; let fileIndex = 1; let rowsInFile: string[] = []
      const header = 'email,first_name,last_name,status'
      const CHUNK = 100_000; const MAX_PER_FILE = 1_000_000
      const flushFile = (rows: string[], idx: number) => {
        const csv = [header, ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const suffix = total > MAX_PER_FILE ? `_parte${idx}` : ''
        a.href = url; a.download = `${list.name.replace(/\s+/g, '_')}${validatedOnly ? '_validos' : ''}${suffix}.csv`; a.click()
        URL.revokeObjectURL(url)
      }
      while (offset < total) {
        const res = await fetch(`/api/admin/lists/export?action=chunk&listId=${list.id}&offset=${offset}&limit=${CHUNK}&validatedOnly=${validatedOnly}`)
        const data = await res.json()
        const rows = (data.data?.rows ?? []) as Record<string, unknown>[]
        if (rows.length === 0) break
        for (const r of rows) {
          rowsInFile.push(`${r.email},${r.first_name ?? ''},${r.last_name ?? ''},${r.status ?? ''}`)
          if (rowsInFile.length >= MAX_PER_FILE) { flushFile(rowsInFile, fileIndex++); rowsInFile = [] }
        }
        offset += CHUNK
      }
      if (rowsInFile.length > 0) flushFile(rowsInFile, fileIndex)
      toast.success(`Descarga completada: ${total.toLocaleString('es-CL')} registros`)
    } catch { toast.error('Error al descargar') }
    finally { setDownloadingId(null) }
  }

  const syncList = async (list: AdminList) => {
    if (!list.completed_job_id) { toast.error('No hay job completado para esta lista'); return }
    setSyncingId(list.id)
    try {
      const res = await fetch('/api/admin/sync-list-counters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listId: list.id, jobId: list.completed_job_id }) })
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
    setSyncingAll(true); let synced = 0
    for (const list of pending) {
      try {
        const res = await fetch('/api/admin/sync-list-counters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listId: list.id, jobId: list.completed_job_id }) })
        if (res.ok) synced++
      } catch { /* continue */ }
    }
    toast.success(`${synced}/${pending.length} listas sincronizadas`); mutate(key); setSyncingAll(false)
  }

  const needsSync = (l: AdminList) => !!l.completed_job_id && l.valid_count === 0 && l.invalid_count === 0 && l.unverified_count > 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Listas de email</h1><p className="text-muted-foreground text-sm mt-1">Todas las listas de todos los usuarios</p></div>
        <Button variant="outline" onClick={syncAll} disabled={syncingAll}>{syncingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}Sincronizar todas</Button>
      </div>

      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar listas..." value={search} onChange={e => setSearch(e.target.value)} /></div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {(lists ?? []).map(list => (
            <Card key={list.id}>
              <div className="p-4 flex items-center gap-4">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{list.name}</span>
                    <Badge variant="outline" className="text-xs">{list.status}</Badge>
                    {needsSync(list) && <Badge variant="secondary" className="text-xs">Sin sincronizar</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{list.user_name ?? list.user_email} · {list.user_email}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs">
                    <span className="text-muted-foreground">{Number(list.total_count ?? 0).toLocaleString('es-CL')} total</span>
                    <span className="text-green-600"><CheckCircle2 className="inline w-3 h-3 mr-0.5" />{Number(list.valid_count ?? 0).toLocaleString('es-CL')}</span>
                    <span className="text-destructive"><XCircle className="inline w-3 h-3 mr-0.5" />{Number(list.invalid_count ?? 0).toLocaleString('es-CL')}</span>
                    <span className="text-muted-foreground"><HelpCircle className="inline w-3 h-3 mr-0.5" />{Number(list.unverified_count ?? 0).toLocaleString('es-CL')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={downloadingId === list.id}>
                        {downloadingId === list.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Descargar lista</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => downloadList(list, false)}><Download className="w-4 h-4 mr-2" />Todos los emails</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadList(list, true)}><CheckCircle2 className="w-4 h-4 mr-2" />Solo validados</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {list.completed_job_id && (
                    <Button variant="outline" size="sm" onClick={() => syncList(list)} disabled={syncingId === list.id}>
                      {syncingId === list.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {!isLoading && (lists ?? []).length === 0 && <p className="text-center py-12 text-muted-foreground">No se encontraron listas</p>}
        </div>
      )}
    </div>
  )
}
