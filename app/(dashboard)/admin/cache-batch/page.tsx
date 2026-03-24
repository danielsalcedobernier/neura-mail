'use client'

import { useRef, useState, useCallback } from 'react'
import useSWR from 'swr'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2,
  AlertCircle, RefreshCw, Clock, Database, ChevronDown, ChevronUp,
  ShieldCheck, ShieldX, ShieldAlert, ShieldQuestion, HelpCircle, Trash2, UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const CHUNK_SIZE = 50_000
const LOOKUP_CHUNK_SIZE = 50_000

interface ResultSummary {
  total: number; valid: number; invalid: number; risky: number
  catch_all: number; unknown: number; disposable: number; role_based: number
}

interface BatchRecord {
  id: string; created_at: string; file_name: string; email_count: number
  mailsso_batch_id: string | null
  status: 'submitted' | 'ready' | 'saved' | 'error' | 'pending_submission' | 'needs_resubmit'
  result_count: number | null; result_summary: ResultSummary | null
  error_message: string | null; fetched_at: string | null; saved_at: string | null
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.json()).then(r => (Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : []))

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  submitted: { label: 'Enviado', variant: 'secondary' },
  ready: { label: 'Listo', variant: 'default' },
  saved: { label: 'Guardado', variant: 'default' },
  error: { label: 'Error', variant: 'destructive' },
  pending_submission: { label: 'En cola', variant: 'outline' },
  needs_resubmit: { label: 'Re-subir archivo', variant: 'destructive' },
}

function fmt(n: number | null) { return n == null ? '—' : n.toLocaleString('es-CL') }
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CacheBatchPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState('')
  const [polling, setPolling] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { data: batches, mutate } = useSWR<BatchRecord[]>('/api/admin/cache-batch', fetcher, { refreshInterval: 10_000 })

  const submitFile = useCallback(async (file: File) => {
    setSubmitting(true)
    setSubmitStatus('Leyendo archivo...')
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true })
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const emailSet = new Set<string>()
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
        for (const row of rows) {
          if (!Array.isArray(row)) continue
          for (const cell of row) {
            const val = String(cell ?? '').trim().toLowerCase()
            if (EMAIL_REGEX.test(val)) emailSet.add(val)
          }
        }
      }
      const allEmails = Array.from(emailSet)
      if (allEmails.length === 0) { toast.error('El archivo no contiene emails válidos'); return }

      setSubmitStatus(`Consultando caché para ${allEmails.length.toLocaleString('es-CL')} emails...`)
      const cachedSet = new Set<string>()
      const lookupChunks = Math.ceil(allEmails.length / LOOKUP_CHUNK_SIZE)
      for (let i = 0; i < lookupChunks; i++) {
        const chunk = allEmails.slice(i * LOOKUP_CHUNK_SIZE, (i + 1) * LOOKUP_CHUNK_SIZE)
        if (lookupChunks > 1) setSubmitStatus(`Consultando caché... bloque ${i + 1}/${lookupChunks}`)
        const res = await fetch('/api/admin/cache-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: chunk }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Error en cache-lookup ${res.status}`)
        for (const e of (data.data?.found ?? data.found ?? [])) cachedSet.add(e)
      }

      const emailsToSend = allEmails.filter(e => !cachedSet.has(e))
      const cachedCount = allEmails.length - emailsToSend.length
      if (emailsToSend.length === 0) { toast.success(`Todos los ${allEmails.length.toLocaleString('es-CL')} emails ya están en caché.`); return }
      if (cachedCount > 0) toast.info(`${cachedCount.toLocaleString('es-CL')} en caché · ${emailsToSend.length.toLocaleString('es-CL')} se enviarán a mails.so`)

      const MAX_CONCURRENT = 2
      const chunks = Math.ceil(emailsToSend.length / CHUNK_SIZE)
      const activeBatches = (batches ?? []).filter(b => b.status === 'submitted').length
      let slotsAvailable = Math.max(0, MAX_CONCURRENT - activeBatches)
      let submitted = 0; let queued = 0

      for (let i = 0; i < chunks; i++) {
        const chunk = emailsToSend.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        const chunkName = chunks > 1 ? `${file.name} (parte ${i + 1}/${chunks})` : file.name
        if (slotsAvailable > 0) {
          setSubmitStatus(`Enviando a mails.so... bloque ${i + 1}/${chunks}`)
          const res = await fetch('/api/admin/cache-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: chunk, fileName: chunkName }) })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
          slotsAvailable--; submitted++
        } else {
          setSubmitStatus(`Guardando en cola... bloque ${i + 1}/${chunks}`)
          const res = await fetch('/api/admin/cache-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: chunk, fileName: chunkName, pending: true }) })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
          queued++
        }
      }
      const parts = []
      if (submitted > 0) parts.push(`${submitted} batch(es) enviados a mails.so`)
      if (queued > 0) parts.push(`${queued} batch(es) en cola`)
      if (cachedCount > 0) parts.push(`${cachedCount.toLocaleString('es-CL')} ya en caché`)
      toast.success(parts.join(' · '))
      mutate()
    } catch (e: unknown) { toast.error((e as Error).message) }
    finally { setSubmitting(false); setSubmitStatus('') }
  }, [mutate, batches])

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'))
    if (file) submitFile(file)
  }
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) submitFile(file); e.target.value = ''
  }

  const deleteBatch = useCallback(async (id: string, fileName: string) => {
    if (!confirm(`¿Eliminar el batch "${fileName}"?`)) return
    setDeleting(d => ({ ...d, [id]: true }))
    try {
      const res = await fetch(`/api/admin/cache-batch/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      toast.success('Batch eliminado'); mutate()
    } catch (e: unknown) { toast.error((e as Error).message) }
    finally { setDeleting(d => ({ ...d, [id]: false })) }
  }, [mutate])

  const consultBatch = useCallback(async (id: string) => {
    setPolling(p => ({ ...p, [id]: true }))
    try {
      const res = await fetch(`/api/admin/cache-batch/${id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      if (data.data?.ready || data.ready) toast.success(`Listo — ${fmt(data.data?.result_count ?? data.result_count)} resultados guardados`)
      else toast.info('Mails.so aún está procesando. Intenta de nuevo en unos minutos.')
      mutate()
    } catch (e: unknown) { toast.error((e as Error).message) }
    finally { setPolling(p => ({ ...p, [id]: false })) }
  }, [mutate])

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Batch mails.so → Caché</CardTitle>
          <CardDescription>Sube un CSV/Excel para enviar los emails a mails.so de forma asíncrona.</CardDescription>
        </CardHeader>
        <CardContent>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onInputChange} />
          <div
            className={cn('border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none', dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/60')}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !submitting && inputRef.current?.click()}
          >
            {submitting ? <Loader2 className="w-8 h-8 animate-spin text-primary" /> : <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />}
            <p className="font-medium">{submitting ? (submitStatus || 'Procesando...') : 'Arrastra un archivo CSV/Excel o haz clic'}</p>
            <p className="text-sm text-muted-foreground">{submitting ? 'Consultando caché primero...' : 'Máx 50.000 emails por batch'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Batches enviados</CardTitle>
            <CardDescription>Haz clic en "Consultar respuesta" para obtener los resultados.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()}><RefreshCw className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent>
          {!batches ? (
            <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><Database className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>No hay batches aún.</p></div>
          ) : (
            <div className="space-y-3">
              {batches.map(b => {
                const isPollable = b.status !== 'saved'
                const isPolling = polling[b.id]
                const isDeleting = deleting[b.id]
                const isExpanded = expanded[b.id]
                const info = STATUS_BADGE[b.status] ?? { label: b.status, variant: 'outline' as const }
                const s = b.result_summary
                const hasSummary = b.status === 'saved' && s != null

                return (
                  <div key={b.id} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <div className="shrink-0">
                        {b.status === 'saved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        {b.status === 'error' && <AlertCircle className="w-5 h-5 text-destructive" />}
                        {b.status === 'submitted' && <Clock className="w-5 h-5 text-muted-foreground" />}
                        {b.status === 'ready' && <CheckCircle2 className="w-5 h-5 text-blue-500" />}
                        {!['saved','error','submitted','ready'].includes(b.status) && <Clock className="w-5 h-5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{b.file_name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(b.created_at)} · {fmt(b.email_count)} emails</p>
                        {b.saved_at && <p className="text-xs text-green-600">{fmt(b.result_count)} resultados · {fmtDate(b.saved_at)}</p>}
                        {b.error_message && <p className="text-xs text-destructive">{b.error_message}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={info.variant}>{info.label}</Badge>
                        {isPollable && (
                          <Button size="sm" variant="outline" onClick={() => consultBatch(b.id)} disabled={isPolling}>
                            {isPolling ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Consultando...</> : <><RefreshCw className="w-3 h-3 mr-1" />Consultar</>}
                          </Button>
                        )}
                        {hasSummary && (
                          <Button size="icon" variant="ghost" onClick={() => setExpanded(e => ({ ...e, [b.id]: !e[b.id] }))}>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => deleteBatch(b.id, b.file_name)}>
                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    {hasSummary && isExpanded && s && (
                      <div className="border-t px-4 py-3 bg-muted/30">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Detalle · {fmt(s.total)} resultados</p>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Válidos', value: s.valid, icon: ShieldCheck, color: 'text-green-600' },
                            { label: 'Inválidos', value: s.invalid, icon: ShieldX, color: 'text-red-500' },
                            { label: 'Riesgosos', value: s.risky, icon: ShieldAlert, color: 'text-yellow-600' },
                            { label: 'Catch-all', value: s.catch_all, icon: ShieldQuestion, color: 'text-blue-500' },
                            { label: 'Desconocido', value: s.unknown, icon: HelpCircle, color: 'text-muted-foreground' },
                            { label: 'Desechables', value: s.disposable, icon: Trash2, color: 'text-orange-500' },
                            { label: 'Rol', value: s.role_based, icon: UserX, color: 'text-purple-500' },
                          ].map(item => (
                            <div key={item.label} className="flex items-center gap-1 text-xs">
                              <item.icon className={cn('w-3 h-3', item.color)} />
                              <span className="font-medium">{fmt(item.value)}</span>
                              <span className="text-muted-foreground">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
