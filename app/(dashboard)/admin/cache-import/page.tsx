'use client'

import { useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const BATCH_SIZE = 5_000   // rows per API call

// Map mails.so result + reason → our verification_status enum
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
  // Detect email column — could be "email", "Email", "correo", etc.
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

type Phase = 'idle' | 'reading' | 'uploading' | 'done' | 'error'

interface Stats {
  total: number
  uploaded: number
  skipped: number   // rows without a valid email
}

export default function CacheImportPage() {
  const inputRef                      = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]       = useState(false)
  const [phase, setPhase]             = useState<Phase>('idle')
  const [fileName, setFileName]       = useState('')
  const [stats, setStats]             = useState<Stats>({ total: 0, uploaded: 0, skipped: 0 })
  const [currentBatch, setCurrentBatch] = useState(0)
  const [totalBatches, setTotalBatches] = useState(0)
  const [errorMsg, setErrorMsg]       = useState('')
  const stopRef                       = useRef(false)

  const pct = totalBatches > 0 ? Math.round((currentBatch / totalBatches) * 100) : 0

  const processFile = useCallback(async (file: File) => {
    if (!file) return
    stopRef.current = false
    setPhase('reading')
    setFileName(file.name)
    setStats({ total: 0, uploaded: 0, skipped: 0 })
    setCurrentBatch(0)
    setTotalBatches(0)
    setErrorMsg('')

    try {
      const buffer   = await file.arrayBuffer()
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true, dense: true })
      const sheet    = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

      const validRows = rawRows
        .map(normaliseRow)
        .filter(r => r.email && r.email.includes('@'))

      const skipped    = rawRows.length - validRows.length
      const batches    = Math.ceil(validRows.length / BATCH_SIZE)

      setStats({ total: rawRows.length, uploaded: 0, skipped })
      setTotalBatches(batches)
      setPhase('uploading')

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
        setCurrentBatch(i + 1)
        setStats(prev => ({ ...prev, uploaded }))

        // Yield between batches
        await new Promise(r => setTimeout(r, 50))
      }

      setPhase('done')
    } catch (e: unknown) {
      setErrorMsg((e as Error).message)
      setPhase('error')
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const reset = () => {
    stopRef.current = true
    setPhase('idle')
    setFileName('')
    setStats({ total: 0, uploaded: 0, skipped: 0 })
    setCurrentBatch(0)
    setTotalBatches(0)
    setErrorMsg('')
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Importar caché de verificación</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sube un archivo exportado por mails.so para pre-cargar el caché global. Los usuarios que verifiquen esos emails no gastarán créditos ni llamarán a la API.
        </p>
      </div>

      {/* Drop zone */}
      {phase === 'idle' && (
        <Card>
          <CardContent className="p-0">
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              )}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onInputChange} />
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Arrastra un archivo Excel o CSV aquí</p>
              <p className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar — .xlsx, .xls, .csv</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reading */}
      {phase === 'reading' && (
        <Card>
          <CardContent className="p-6 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Leyendo archivo...</p>
              <p className="text-xs text-muted-foreground truncate max-w-xs">{fileName}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Uploading */}
      {phase === 'uploading' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium truncate max-w-xs">{fileName}</CardTitle>
              </div>
              <Button size="sm" variant="ghost" onClick={reset} className="h-7 w-7 p-0">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            <CardDescription>
              Batch {currentBatch} / {totalBatches} — {stats.uploaded.toLocaleString('es-CL')} filas subidas
              {stats.skipped > 0 && <span className="text-orange-500"> · {stats.skipped.toLocaleString('es-CL')} sin email válido</span>}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <Progress value={pct} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">{pct}%</p>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {phase === 'done' && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">Importación completada</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total en archivo', value: stats.total.toLocaleString('es-CL') },
                { label: 'Cargados al caché', value: stats.uploaded.toLocaleString('es-CL') },
                { label: 'Omitidos', value: stats.skipped.toLocaleString('es-CL') },
              ].map(s => (
                <div key={s.label} className="bg-background rounded-md p-3 text-center border">
                  <p className="text-lg font-semibold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              Importar otro archivo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {phase === 'error' && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">Error en la importación</p>
            </div>
            <p className="text-xs text-muted-foreground bg-muted rounded-md p-3 font-mono">{errorMsg}</p>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">Reintentar</Button>
          </CardContent>
        </Card>
      )}

      {/* Column mapping reference */}
      {phase === 'idle' && (
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
