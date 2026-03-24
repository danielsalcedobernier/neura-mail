'use client'

import { useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const BATCH_SIZE = 5_000

function mapStatus(row: Record<string, unknown>): string {
  const result = String(row.result ?? row.Result ?? row.status ?? row.Status ?? '').toLowerCase()
  const reason = String(row.reason ?? row.Reason ?? '').toLowerCase()
  if (reason.includes('catch_all') || reason.includes('catchall')) return 'catch_all'
  if (result === 'deliverable') return 'valid'
  if (result === 'undeliverable') return 'invalid'
  if (result === 'risky') return 'risky'
  if (result === 'valid') return 'valid'
  if (result === 'invalid') return 'invalid'
  return 'unknown'
}

function parseBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') return val === 1
  const s = String(val ?? '').toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'si'
}

function normaliseRow(raw: Record<string, unknown>) {
  const emailKey = Object.keys(raw).find(k => k.toLowerCase().includes('email') || k.toLowerCase().includes('correo') || k.toLowerCase() === 'e-mail')
  const email = String(raw[emailKey ?? ''] ?? '').toLowerCase().trim()
  return {
    email,
    verification_status: mapStatus(raw),
    verification_score: Number(raw.score ?? raw.Score ?? raw.verification_score ?? 0),
    mx_found: parseBoolean(raw.mx_found ?? raw.mx ?? raw.has_mx),
    smtp_valid: parseBoolean(raw.smtp_valid ?? raw.smtp ?? raw.is_smtp_valid),
    is_disposable: parseBoolean(raw.is_disposable ?? raw.disposable),
    is_role_based: parseBoolean(raw.is_role_based ?? raw.role_based ?? raw.is_role),
    is_catch_all: parseBoolean(raw.is_catch_all ?? raw.catch_all ?? (mapStatus(raw) === 'catch_all')),
    provider: String(raw.provider ?? raw.Provider ?? raw.domain ?? '') || null,
  }
}

interface StatusCounts { valid: number; invalid: number; risky: number; catch_all: number; unknown: number }
interface FileEntry {
  name: string; status: 'pending' | 'reading' | 'uploading' | 'done' | 'error'
  total: number; uploaded: number; skipped: number; currentBatch: number; totalBatches: number
  counts: StatusCounts; error?: string
}
const EMPTY_COUNTS = (): StatusCounts => ({ valid: 0, invalid: 0, risky: 0, catch_all: 0, unknown: 0 })

export default function CacheImportPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [running, setRunning] = useState(false)
  const stopRef = useRef(false)

  const isDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'error')
  const totalUploaded = files.reduce((s, f) => s + f.uploaded, 0)
  const totalSkipped = files.reduce((s, f) => s + f.skipped, 0)
  const totalRows = files.reduce((s, f) => s + f.total, 0)

  const updateFile = useCallback((name: string, patch: Partial<FileEntry>) => {
    setFiles(prev => prev.map(f => f.name === name ? { ...f, ...patch } : f))
  }, [])

  const processFiles = useCallback(async (fileList: File[]) => {
    stopRef.current = false; setRunning(true)
    const entries: FileEntry[] = fileList.map(f => ({ name: f.name, status: 'pending', total: 0, uploaded: 0, skipped: 0, currentBatch: 0, totalBatches: 0, counts: EMPTY_COUNTS() }))
    setFiles(prev => [...prev, ...entries])

    for (const file of fileList) {
      if (stopRef.current) break
      updateFile(file.name, { status: 'reading' })
      try {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true, dense: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
        const validRows = rawRows.map(normaliseRow).filter(r => r.email && r.email.includes('@'))
        const skipped = rawRows.length - validRows.length
        const batches = Math.ceil(validRows.length / BATCH_SIZE)
        const counts = EMPTY_COUNTS()
        for (const r of validRows) { const k = r.verification_status as keyof StatusCounts; if (k in counts) counts[k]++; else counts.unknown++ }
        updateFile(file.name, { status: 'uploading', total: rawRows.length, skipped, totalBatches: batches, counts })
        let uploaded = 0
        for (let i = 0; i < batches; i++) {
          if (stopRef.current) break
          const chunk = validRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
          const res = await fetch('/api/admin/cache-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: chunk }) })
          if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error ?? `Error ${res.status}`) }
          uploaded += chunk.length
          updateFile(file.name, { currentBatch: i + 1, uploaded })
          await new Promise(r => setTimeout(r, 50))
        }
        updateFile(file.name, { status: 'done' })
      } catch (e: unknown) { updateFile(file.name, { status: 'error', error: (e as Error).message }) }
    }
    setRunning(false)
  }, [updateFile])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'))
    if (dropped.length > 0) processFiles(dropped)
  }, [processFiles])

  const reset = () => { stopRef.current = true; setFiles([]); setRunning(false) }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Importar caché de verificación</CardTitle>
          <CardDescription>Sube archivos exportados por mails.so para pre-cargar el caché global.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={e => { const s = Array.from(e.target.files ?? []); if (s.length) processFiles(s); e.target.value = '' }} />
          {!running && (
            <div
              className={cn('border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors', dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/60')}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              <p className="font-medium">Arrastra uno o varios archivos Excel o CSV</p>
              <p className="text-sm text-muted-foreground">.xlsx, .xls, .csv</p>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-3">
              {files.map(f => {
                const pct = f.totalBatches > 0 ? Math.round((f.currentBatch / f.totalBatches) * 100) : 0
                return (
                  <div key={f.name} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      {f.status === 'pending' && <Upload className="w-5 h-5 text-muted-foreground" />}
                      {f.status === 'reading' && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                      {f.status === 'uploading' && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                      {f.status === 'done' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                      {f.status === 'error' && <AlertCircle className="w-5 h-5 text-destructive" />}
                      <span className="font-medium text-sm flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {f.status === 'pending' && 'En cola'}
                        {f.status === 'reading' && 'Leyendo...'}
                        {f.status === 'uploading' && `${pct}%`}
                        {f.status === 'done' && `${f.uploaded.toLocaleString('es-CL')} subidos`}
                        {f.status === 'error' && 'Error'}
                      </span>
                    </div>
                    {f.status === 'uploading' && <Progress value={pct} className="h-1.5" />}
                    {f.status === 'error' && <p className="text-xs text-destructive">{f.error}</p>}
                  </div>
                )
              })}
            </div>
          )}

          {isDone && (
            <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
              <div className="text-sm">
                <p className="font-medium">{totalUploaded.toLocaleString('es-CL')} filas importadas</p>
                {totalSkipped > 0 && <p className="text-muted-foreground">{totalSkipped.toLocaleString('es-CL')} omitidas</p>}
              </div>
              <Button variant="outline" size="sm" onClick={reset}>Importar más</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
