'use client'

import { useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const BATCH_SIZE = 5_000

function mapStatus(row: Record<string, unknown>): string {
  const result = String(row.result ?? row.Result ?? row.status ?? row.Status ?? '').toLowerCase()
  const reason = String(row.reason ?? row.Reason ?? '').toLowerCase()
  if (reason.includes('catch_all') || reason.includes('catchall')) return 'catch_all'
  if (result === 'deliverable')   return 'valid'
  if (result === 'undeliverable') return 'invalid'
  if (result === 'risky')         return 'risky'
  if (result === 'valid')         return 'valid'
  if (result === 'invalid')       return 'invalid'
  return 'unknown'
}

function parseBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'number')  return val === 1
  const s = String(val ?? '').toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'si'
}

function normaliseRow(raw: Record<string, unknown>) {
  const emailKey = Object.keys(raw).find(k =>
    k.toLowerCase().includes('email') || k.toLowerCase().includes('correo') || k.toLowerCase() === 'e-mail'
  )
  const email = String(raw[emailKey ?? ''] ?? '').toLowerCase().trim()
  return {
    email,
    verification_status: mapStatus(raw),
    verification_score:  Number(raw.score ?? raw.Score ?? raw.verification_score ?? 0),
    mx_found:            parseBoolean(raw.mx_found ?? raw.mx ?? raw.has_mx),
    smtp_valid:          parseBoolean(raw.smtp_valid ?? raw.smtp ?? raw.is_smtp_valid),
    is_disposable:       parseBoolean(raw.is_disposable ?? raw.disposable),
    is_role_based:       parseBoolean(raw.is_role_based ?? raw.role_based ?? raw.is_role),
    is_catch_all:        parseBoolean(raw.is_catch_all ?? raw.catch_all ?? (mapStatus(raw) === 'catch_all')),
    provider:            String(raw.provider ?? raw.Provider ?? raw.domain ?? '') || null,
  }
}

interface FileEntry {
  name: string
  status: 'pending' | 'reading' | 'uploading' | 'done' | 'error'
  total: number
  uploaded: number
  skipped: number
  currentBatch: number
  totalBatches: number
  error?: string
}

export default function CacheImportPage() {
  const inputRef                    = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]     = useState(false)
  const [files, setFiles]           = useState<FileEntry[]>([])
  const [running, setRunning]       = useState(false)
  const stopRef                     = useRef(false)

  const isDone    = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  const totalUploaded = files.reduce((s, f) => s + f.uploaded, 0)
  const totalSkipped  = files.reduce((s, f) => s + f.skipped, 0)
  const totalRows     = files.reduce((s, f) => s + f.total, 0)

  const updateFile = useCallback((name: string, patch: Partial<FileEntry>) => {
    setFiles(prev => prev.map(f => f.name === name ? { ...f, ...patch } : f))
  }, [])

  const processFiles = useCallback(async (fileList: File[]) => {
    stopRef.current = false
    setRunning(true)

    const entries: FileEntry[] = fileList.map(f => ({
      name: f.name, status: 'pending',
      total: 0, uploaded: 0, skipped: 0, currentBatch: 0, totalBatches: 0,
    }))
    setFiles(prev => [...prev, ...entries])

    for (const file of fileList) {
      if (stopRef.current) break

      updateFile(file.name, { status: 'reading' })

      try {
        const buffer   = await file.arrayBuffer()
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true, dense: true })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

        const validRows = rawRows.map(normaliseRow).filter(r => r.email && r.email.includes('@'))
        const skipped   = rawRows.length - validRows.length
        const batches   = Math.ceil(validRows.length / BATCH_SIZE)

        updateFile(file.name, {
          status: 'uploading',
          total: rawRows.length, skipped, totalBatches: batches,
        })

        let uploaded = 0
        for (let i = 0; i < batches; i++) {
          if (stopRef.current) break
          const chunk = validRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)

          const res = await fetch('/api/admin/cache-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: chunk }),
          })

          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.error ?? `Error ${res.status} en batch ${i + 1}`)
          }

          uploaded += chunk.length
          updateFile(file.name, { currentBatch: i + 1, uploaded })
          await new Promise(r => setTimeout(r, 50))
        }

        updateFile(file.name, { status: 'done' })
      } catch (e: unknown) {
        updateFile(file.name, { status: 'error', error: (e as Error).message })
      }
    }

    setRunning(false)
  }, [updateFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    )
    if (dropped.length > 0) processFiles(dropped)
  }, [processFiles])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length > 0) processFiles(selected)
    e.target.value = ''
  }

  const reset = () => {
    stopRef.current = true
    setFiles([])
    setRunning(false)
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Importar caché de verificación</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sube uno o varios archivos exportados por mails.so para pre-cargar el caché global. Los usuarios que verifiquen esos emails no gastarán créditos ni llamarán a la API.
        </p>
      </div>

      {/* Drop zone — always visible unless running */}
      {!running && (
        <Card>
          <CardContent className="p-0">
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              )}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" multiple onChange={onInputChange} />
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Arrastra uno o varios archivos Excel o CSV</p>
              <p className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar — .xlsx, .xls, .csv</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(f => {
            const pct = f.totalBatches > 0 ? Math.round((f.currentBatch / f.totalBatches) * 100) : 0
            return (
              <Card key={f.name} className={cn(
                f.status === 'done'  && 'border-green-500/30 bg-green-500/5',
                f.status === 'error' && 'border-destructive/30 bg-destructive/5',
              )}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {f.status === 'pending'   && <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />}
                      {f.status === 'reading'   && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                      {f.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                      {f.status === 'done'      && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                      {f.status === 'error'     && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
                      <span className="text-sm font-medium truncate">{f.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {f.status === 'pending'   && 'En cola'}
                      {f.status === 'reading'   && 'Leyendo...'}
                      {f.status === 'uploading' && `${pct}%`}
                      {f.status === 'done'      && `${f.uploaded.toLocaleString('es-CL')} subidos`}
                      {f.status === 'error'     && 'Error'}
                    </span>
                  </div>

                  {f.status === 'uploading' && (
                    <Progress value={pct} className="h-1.5" />
                  )}

                  {f.status === 'uploading' && (
                    <p className="text-xs text-muted-foreground">
                      Batch {f.currentBatch}/{f.totalBatches} · {f.uploaded.toLocaleString('es-CL')} filas
                      {f.skipped > 0 && <span className="text-orange-500"> · {f.skipped.toLocaleString('es-CL')} omitidas</span>}
                    </p>
                  )}

                  {f.status === 'error' && (
                    <p className="text-xs font-mono text-destructive bg-destructive/10 rounded px-2 py-1">{f.error}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Summary when all done */}
      {isDone && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Resumen de importación</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total en archivos', value: totalRows.toLocaleString('es-CL') },
                { label: 'Cargados al caché', value: totalUploaded.toLocaleString('es-CL') },
                { label: 'Omitidos', value: totalSkipped.toLocaleString('es-CL') },
              ].map(s => (
                <div key={s.label} className="bg-muted/50 rounded-md p-3 text-center">
                  <p className="text-lg font-semibold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">Importar más archivos</Button>
          </CardContent>
        </Card>
      )}

      {/* Column reference */}
      {files.length === 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4" /> Columnas reconocidas del archivo
            </CardTitle>
            <CardDescription>El sistema detecta automáticamente estas columnas. Las demás se ignoran.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                ['email / correo / e-mail', 'Email del contacto (obligatorio)'],
                ['result / status', 'deliverable · undeliverable · risky · unknown'],
                ['reason', 'catch_all · disposable · etc.'],
                ['score / verification_score', 'Puntaje numérico'],
                ['mx_found / has_mx', 'true / false'],
                ['smtp_valid / is_smtp_valid', 'true / false'],
                ['is_disposable / disposable', 'true / false'],
                ['is_role_based / role_based', 'true / false'],
                ['is_catch_all / catch_all', 'true / false'],
                ['provider / domain', 'Nombre del proveedor'],
              ].map(([col, desc]) => (
                <div key={col} className="flex flex-col gap-0.5 bg-muted/50 rounded-md p-2">
                  <span className="font-mono text-foreground">{col}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
