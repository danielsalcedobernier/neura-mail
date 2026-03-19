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

const CHUNK_SIZE = 25_000

interface ResultSummary {
  total:      number
  valid:      number
  invalid:    number
  risky:      number
  catch_all:  number
  unknown:    number
  disposable: number
  role_based: number
}

interface BatchRecord {
  id: string
  created_at: string
  file_name: string
  email_count: number
  mailsso_batch_id: string | null
  status: 'submitted' | 'ready' | 'saved' | 'error'
  result_count: number | null
  result_summary: ResultSummary | null
  error_message: string | null
  fetched_at: string | null
  saved_at: string | null
}

const fetcher = (url: string) =>
  fetch(url)
    .then(r => r.json())
    .then(r => (Array.isArray(r.data) ? r.data : Array.isArray(r) ? r : []))

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  submitted: { label: 'Enviado',    variant: 'secondary' },
  ready:     { label: 'Listo',      variant: 'default' },
  saved:     { label: 'Guardado',   variant: 'default' },
  error:     { label: 'Error',      variant: 'destructive' },
}

function fmt(n: number | null) {
  return n == null ? '—' : n.toLocaleString('es-CL')
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CacheBatchPage() {
  const inputRef            = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling]   = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { data: batches, mutate } = useSWR<BatchRecord[]>(
    '/api/admin/cache-batch',
    fetcher,
    { refreshInterval: 10_000 }
  )

  // ── Upload + submit ────────────────────────────────────────────────────────
  const submitFile = useCallback(async (file: File) => {
    setSubmitting(true)
    try {
      const buffer   = await file.arrayBuffer()
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true })
      const sheet    = workbook.Sheets[workbook.SheetNames[0]]
      const rows     = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

      // Detect email column by name first, then fall back to scanning cell values
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      const NAME_PATTERNS = [
        'email', 'e-mail', 'e_mail', 'mail', 'correo', 'correo_electronico',
        'correo electronico', 'correo electrónico', 'emailaddress', 'email_address',
        'email address', 'contact', 'contacto',
      ]

      const keys = Object.keys(rows[0] ?? {})

      // 1. Exact name match (case-insensitive)
      let emailKey = keys.find(k => NAME_PATTERNS.includes(k.toLowerCase()))

      // 2. Partial name match
      if (!emailKey) {
        emailKey = keys.find(k =>
          NAME_PATTERNS.some(p => k.toLowerCase().includes(p))
        )
      }

      // 3. Scan cell values — pick the column with the most email-looking values
      if (!emailKey) {
        let bestKey = ''
        let bestCount = 0
        for (const k of keys) {
          const count = rows.filter(r => EMAIL_REGEX.test(String(r[k] ?? '').trim())).length
          if (count > bestCount) { bestCount = count; bestKey = k }
        }
        if (bestCount > 0) emailKey = bestKey
      }

      if (!emailKey) {
        toast.error('No se encontró columna de email en el archivo')
        return
      }

      const emails = rows
        .map(r => String(r[emailKey!] ?? '').toLowerCase().trim())
        .filter(e => EMAIL_REGEX.test(e))

      if (emails.length === 0) {
        toast.error('El archivo no contiene emails válidos')
        return
      }

      // Send in chunks of 25k — each chunk becomes a separate mails.so batch
      const chunks = Math.ceil(emails.length / CHUNK_SIZE)
      let sent = 0
      for (let i = 0; i < chunks; i++) {
        const chunk = emails.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        const chunkName = chunks > 1 ? `${file.name} (parte ${i + 1}/${chunks})` : file.name

        const res = await fetch('/api/admin/cache-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: chunk, fileName: chunkName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
        sent += chunk.length
      }

      toast.success(`${emails.length.toLocaleString('es-CL')} emails enviados a mails.so en ${chunks} batch(es)`)
      mutate()
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }, [mutate])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = Array.from(e.dataTransfer.files).find(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    )
    if (file) submitFile(file)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) submitFile(file)
    e.target.value = ''
  }

  // ── Delete batch ──────────────────────────────────────────────────────────
  const deleteBatch = useCallback(async (id: string, fileName: string) => {
    if (!confirm(`¿Eliminar el batch "${fileName}"? Esto no afecta el caché ya guardado.`)) return
    setDeleting(d => ({ ...d, [id]: true }))
    try {
      const res = await fetch(`/api/admin/cache-batch/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      toast.success('Batch eliminado — puedes volver a enviarlo')
      mutate()
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(d => ({ ...d, [id]: false }))
    }
  }, [mutate])

  // ── Poll batch ─────────────────────────────────────────────────────────────
  const consultBatch = useCallback(async (id: string) => {
    setPolling(p => ({ ...p, [id]: true }))
    try {
      const res = await fetch(`/api/admin/cache-batch/${id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)

      if (data.data?.ready || data.ready) {
        const count = data.data?.result_count ?? data.result_count
        toast.success(`Listo — ${fmt(count)} resultados guardados en caché`)
      } else {
        toast.info('Mails.so aún está procesando el batch. Intenta de nuevo en unos minutos.')
      }
      mutate()
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setPolling(p => ({ ...p, [id]: false }))
    }
  }, [mutate])

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Batch mails.so → Caché</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sube un CSV/Excel para enviar los emails a mails.so de forma asíncrona. Luego consulta el resultado cuando esté listo y se guardará automáticamente en el caché global.
        </p>
      </div>

      {/* Drop zone */}
      <Card>
        <CardContent className="p-0">
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
              submitting && 'pointer-events-none opacity-60'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !submitting && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onInputChange}
            />
            {submitting ? (
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-primary animate-spin" />
            ) : (
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            )}
            <p className="text-sm font-medium text-foreground">
              {submitting ? 'Enviando a mails.so...' : 'Arrastra un archivo CSV/Excel o haz clic'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Se detecta la columna email automáticamente · Máx 25.000 emails por batch
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Batch list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" /> Batches enviados
              </CardTitle>
              <CardDescription>Batches enviados a mails.so. Haz clic en "Consultar respuesta" para obtener los resultados.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => mutate()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!batches ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
            </div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <FileSpreadsheet className="w-8 h-8" />
              <p className="text-sm">No hay batches aún. Sube un archivo para empezar.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {batches.map(b => {
                const isPollable  = b.status !== 'saved'
                const isPolling   = polling[b.id]
                const isDeleting  = deleting[b.id]
                const isExpanded  = expanded[b.id]
                const info        = STATUS_BADGE[b.status] ?? { label: b.status, variant: 'outline' as const }
                const s           = b.result_summary
                const hasSummary  = b.status === 'saved' && s != null

                const SUMMARY_ITEMS = s ? [
                  { label: 'Válidos',      value: s.valid,      icon: ShieldCheck,    color: 'text-green-600' },
                  { label: 'Inválidos',    value: s.invalid,    icon: ShieldX,        color: 'text-red-500' },
                  { label: 'Riesgosos',    value: s.risky,      icon: ShieldAlert,    color: 'text-yellow-600' },
                  { label: 'Catch-all',    value: s.catch_all,  icon: ShieldQuestion, color: 'text-blue-500' },
                  { label: 'Desconocido',  value: s.unknown,    icon: HelpCircle,     color: 'text-muted-foreground' },
                  { label: 'Desechables',  value: s.disposable, icon: Trash2,         color: 'text-orange-500' },
                  { label: 'Rol/genérico', value: s.role_based, icon: UserX,          color: 'text-purple-500' },
                ] : []

                return (
                  <div key={b.id} className="border-b border-border last:border-b-0">
                    {/* Main row */}
                    <div className="flex items-center gap-4 px-4 py-3">
                      {/* Icon */}
                      <div className="shrink-0">
                        {b.status === 'saved'     && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                        {b.status === 'error'     && <AlertCircle  className="w-5 h-5 text-destructive" />}
                        {b.status === 'submitted' && <Clock        className="w-5 h-5 text-muted-foreground" />}
                        {b.status === 'ready'     && <CheckCircle2 className="w-5 h-5 text-primary" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{b.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(b.created_at)} · {fmt(b.email_count)} emails
                          {b.mailsso_batch_id && (
                            <span className="ml-2 font-mono opacity-60">{b.mailsso_batch_id}</span>
                          )}
                        </p>
                        {b.saved_at && (
                          <p className="text-xs text-green-600">
                            {fmt(b.result_count)} resultados guardados · {fmtDate(b.saved_at)}
                          </p>
                        )}
                        {b.error_message && (
                          <p className="text-xs text-destructive font-mono mt-0.5">{b.error_message}</p>
                        )}
                      </div>

                      {/* Status + actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={info.variant} className="text-xs">{info.label}</Badge>
                        {isPollable && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPolling}
                            onClick={() => consultBatch(b.id)}
                          >
                            {isPolling
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Consultando...</>
                              : <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Consultar respuesta</>
                            }
                          </Button>
                        )}
                        {hasSummary && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpanded(e => ({ ...e, [b.id]: !e[b.id] }))}
                          >
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4" />
                              : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isDeleting}
                          onClick={() => deleteBatch(b.id, b.file_name)}
                          title="Eliminar batch"
                        >
                          {isDeleting
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            : <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          }
                        </Button>
                      </div>
                    </div>

                    {/* Expandable summary */}
                    {hasSummary && isExpanded && s && (
                      <div className="px-4 pb-4 bg-muted/30">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 pt-2">
                          Detalle de validación · {fmt(s.total)} resultados guardados en caché
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {SUMMARY_ITEMS.map(item => (
                            <div
                              key={item.label}
                              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                            >
                              <item.icon className={cn('w-4 h-4 shrink-0', item.color)} />
                              <div className="min-w-0">
                                <p className="text-xs text-muted-foreground leading-none">{item.label}</p>
                                <p className="text-sm font-semibold text-foreground tabular-nums">
                                  {fmt(item.value)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {s.total > 0 ? ((item.value / s.total) * 100).toFixed(1) : '0'}%
                                </p>
                              </div>
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
