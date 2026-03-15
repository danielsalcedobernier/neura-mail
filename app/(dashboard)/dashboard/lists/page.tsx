'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Upload, Plus, Trash2, FileText, Loader2, CheckCircle2,
  ClipboardPaste, FolderOpen, X, Terminal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

// ─── Column mapping types ────────────────────────────────────────────────────
interface ColumnMapping { email: number; first_name: number; last_name: number }
interface PreviewData {
  headers: string[]
  sample: string[][]
  suggested: { email: number; first_name: number; last_name: number }
  totalLines: number
}

// ─── Live console log panel ───────────────────────────────────────────────────
type LogLevel = 'info' | 'success' | 'warn' | 'error'
interface LogEntry { time: string; level: LogLevel; msg: string }

function useImportLog() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const log = (msg: string, level: LogLevel = 'info') => {
    const time = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [...prev, { time, level, msg }])
  }
  const clear = () => setLogs([])
  return { logs, log, clear }
}

const levelColor: Record<LogLevel, string> = {
  info:    'text-muted-foreground',
  success: 'text-green-500',
  warn:    'text-yellow-500',
  error:   'text-destructive',
}
const levelPrefix: Record<LogLevel, string> = {
  info: '›', success: '✓', warn: '⚠', error: '✗',
}

function ImportConsole({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])
  if (logs.length === 0) return null
  return (
    <div className="rounded-md border border-border bg-[hsl(var(--muted)/0.4)] font-mono text-xs overflow-y-auto max-h-36 p-2 flex flex-col gap-0.5">
      {logs.map((l, i) => (
        <div key={i} className="flex gap-2 leading-5">
          <span className="text-muted-foreground/50 shrink-0">{l.time}</span>
          <span className={`shrink-0 ${levelColor[l.level]}`}>{levelPrefix[l.level]}</span>
          <span className={levelColor[l.level]}>{l.msg}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const statusBadge: Record<string, string> = {
  pending:    'bg-muted text-muted-foreground',
  processing: 'bg-yellow-500/10 text-yellow-600',
  ready:      'bg-green-500/10 text-green-600',
  error:      'bg-destructive/10 text-destructive',
}
const statusLabel: Record<string, string> = {
  pending: 'pendiente', processing: 'procesando', ready: 'lista', error: 'error',
}

// ─── shared upload logic (worker + batch) ───────────────────────────────────
const PARALLEL_BATCHES = 4

type Logger = (msg: string, level?: LogLevel) => void

async function sendBatch(listId: string, rows: unknown[]) {
  const res = await fetch(`/api/lists/${listId}/contacts/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  if (!res.ok) throw new Error('Error al guardar batch')
}

// Phase 1: load file, detect columns, return preview for user to confirm mapping
function previewFile(file: File): Promise<PreviewData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/workers/csv-parser.worker.js')
    worker.onmessage = (e) => {
      if (e.data.type === 'preview') { worker.terminate(); resolve(e.data) }
      if (e.data.type === 'error')   { worker.terminate(); reject(new Error(e.data.message)) }
    }
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message)) }
    worker.postMessage({ type: 'preview', file })
  })
}

async function importFileToList(
  file: File,
  listId: string,
  mapping: ColumnMapping,
  onStep: (step: string) => void,
  onProgress: (pct: number, count: number) => void,
  log: Logger,
) {
  log(`Archivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
  log('Iniciando procesamiento en el navegador...')

  const worker = new Worker('/workers/csv-parser.worker.js')
  return new Promise<{ total: number; duplicates: number }>((resolve, reject) => {
    const inFlight: Promise<void>[] = []
    let pendingDone: { total: number; duplicates: number } | null = null
    let batchCount = 0
    let lastLoggedPct = -1

    const drainAndFinalize = () => {
      log(`Todos los batches enviados. Finalizando...`)
      Promise.all(inFlight).then(async () => {
        const d = pendingDone!
        await fetch(`/api/lists/${listId}/contacts/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: [], done: true, total: d.total, duplicates: d.duplicates }),
        })
        log(`Listo. ${d.total.toLocaleString('es-CL')} emails importados, ${d.duplicates.toLocaleString('es-CL')} duplicados ignorados.`, 'success')
        worker.terminate()
        resolve(d)
      }).catch(reject)
    }

    worker.onmessage = (e) => {
      const msg = e.data

      if (msg.type === 'progress') {
        const pct = msg.total > 0 ? Math.round((msg.parsed / msg.total) * 100) : 0
        onProgress(pct, msg.parsed)
        // Log every 10%
        if (pct % 10 === 0 && pct !== lastLoggedPct) {
          lastLoggedPct = pct
          log(`Leyendo archivo... ${pct}% (${msg.parsed.toLocaleString('es-CL')} emails encontrados)`)
        }
      }

      if (msg.type === 'batch') {
        batchCount++
        const batchNum = batchCount
        log(`Enviando batch #${batchNum} (${msg.rows.length.toLocaleString('es-CL')} emails) al servidor...`)
        const p = (inFlight.length >= PARALLEL_BATCHES
          ? inFlight.shift()!
          : Promise.resolve()
        ).then(() => sendBatch(listId, msg.rows).then(() => {
          log(`Batch #${batchNum} guardado en base de datos.`, 'success')
        }))
        inFlight.push(p)
        p.catch(reject)
      }

      if (msg.type === 'done') {
        onStep('saving')
        log(`Archivo procesado. ${msg.total.toLocaleString('es-CL')} emails únicos detectados.`)
        pendingDone = { total: msg.total, duplicates: msg.duplicates }
        drainAndFinalize()
      }

      if (msg.type === 'error') {
        log(`Error: ${msg.message}`, 'error')
        worker.terminate()
        reject(new Error(msg.message))
      }
    }
    worker.onerror = (e) => { log(`Error del worker: ${e.message}`, 'error'); worker.terminate(); reject(new Error(e.message)) }
    worker.postMessage({ type: 'parse', file, mapping })
  })
}

// ─── parse plain-text paste (one email per line, or comma-separated) ─────────
function parsePastedEmails(text: string) {
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const emails = text.match(EMAIL_RE) ?? []
  const seen = new Set<string>()
  const rows: { email: string; first_name: null; last_name: null }[] = []
  let duplicates = 0
  for (const e of emails) {
    const lower = e.toLowerCase()
    if (seen.has(lower)) { duplicates++; continue }
    seen.add(lower)
    rows.push({ email: lower, first_name: null, last_name: null })
  }
  return { rows, duplicates }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ListsPage() {
  const { data: lists, isLoading } = useSWR('/api/lists', fetcher, { refreshInterval: 5000 })

  // Create list dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // Import dialog
  const [importListId, setImportListId] = useState<string | null>(null)
  const [importListName, setImportListName] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  // Import state
  const [importing, setImporting] = useState(false)
  const [importStep, setImportStep] = useState<'idle' | 'parsing' | 'saving'>('idle')
  const [importPct, setImportPct] = useState(0)
  const [importCount, setImportCount] = useState(0)

  // Paste state
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<number | null>(null)

  // File drag state
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Column mapping preview
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [mapping, setMapping] = useState<ColumnMapping>({ email: -1, first_name: -1, last_name: -1 })

  // Console log
  const { logs, log, clear } = useImportLog()

  // ── Create list ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Ingresa un nombre para la lista'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al crear lista'); return }
      toast.success('Lista creada')
      mutate('/api/lists')
      setCreateOpen(false)
      setNewName('')
    } catch { toast.error('Error al crear lista') }
    finally { setCreating(false) }
  }

  // ── Open import dialog ────────────────────────────────────────────────────
  const selectFile = async (f: File) => {
    setFile(f)
    setPreview(null)
    setMapping({ email: -1, first_name: -1, last_name: -1 })
    setPreviewing(true)
    try {
      const p = await previewFile(f)
      setPreview(p)
      setMapping({ email: p.suggested.email, first_name: p.suggested.first_name, last_name: p.suggested.last_name })
    } catch {
      toast.error('No se pudo leer el archivo')
      setFile(null)
    } finally {
      setPreviewing(false)
    }
  }

  const openImport = (id: string, name: string) => {
    setImportListId(id)
    setImportListName(name)
    setFile(null)
    setPreview(null)
    setMapping({ email: -1, first_name: -1, last_name: -1 })
    setPasteText('')
    setPastePreview(null)
    setImportStep('idle')
    setImportPct(0)
    setImportCount(0)
    clear()
    setImportOpen(true)
  }

  // ── Import via file ────────────────────────────────────────────────────────
  const handleFileImport = async (f: File) => {
    if (!importListId) return
    setImporting(true)
    setImportStep('parsing')
    clear()
    try {
      const result = await importFileToList(
        f,
        importListId,
        mapping,
        setImportStep,
        (pct, count) => { setImportPct(pct); setImportCount(count) },
        log,
      )
      toast.success(`${result.total.toLocaleString('es-CL')} emails importados (${result.duplicates} duplicados ignorados)`)
      mutate('/api/lists')
      setImportOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al importar')
    } finally {
      setImporting(false)
      setImportStep('idle')
      setImportPct(0)
      setImportCount(0)
    }
  }

  // ── Import via paste ────────────────────────────────────────────────────────
  const handlePasteImport = async () => {
    if (!importListId || !pasteText.trim()) return
    const { rows, duplicates } = parsePastedEmails(pasteText)
    if (rows.length === 0) { toast.error('No se encontraron emails válidos en el texto'); return }
    setImporting(true)
    setImportStep('saving')
    clear()
    log(`${rows.length.toLocaleString('es-CL')} emails detectados, ${duplicates} duplicados ignorados.`)
    log('Enviando al servidor en batches...')
    try {
      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const last = i + BATCH >= rows.length
        const batchNum = Math.floor(i / BATCH) + 1
        log(`Enviando batch #${batchNum} (${batch.length} emails)...`)
        await fetch(`/api/lists/${importListId}/contacts/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: batch,
            done: last,
            total: last ? rows.length : undefined,
            duplicates: last ? duplicates : undefined,
          }),
        })
        log(`Batch #${batchNum} guardado.`, 'success')
        setImportPct(Math.round(((i + batch.length) / rows.length) * 100))
      }
      log(`Importación completa. ${rows.length.toLocaleString('es-CL')} emails guardados.`, 'success')
      toast.success(`${rows.length.toLocaleString('es-CL')} emails importados`)
      mutate('/api/lists')
      setImportOpen(false)
      setPasteText('')
    } catch { 
      log('Error al importar. Intenta nuevamente.', 'error')
      toast.error('Error al importar') 
    }
    finally { setImporting(false); setImportStep('idle'); setImportPct(0) }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta lista y todos sus contactos?')) return
    const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Lista eliminada'); mutate('/api/lists') }
    else toast.error('Error al eliminar')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Listas de email</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Crea listas e importa contactos desde archivos o texto.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Nueva lista
        </Button>
      </div>

      {/* ── Lists ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !lists?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-10 h-10 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">Aún no hay listas</p>
            <p className="text-xs text-muted-foreground">Crea tu primera lista para comenzar</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Nueva lista
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {lists.map((list: Record<string, unknown>) => (
            <Card key={list.id as string} className="hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-foreground text-sm truncate">{list.name as string}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[list.status as string]}`}>
                        {statusLabel[list.status as string] ?? list.status as string}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{Number(list.total_count).toLocaleString('es-CL')} total</span>
                      <span className="text-green-600">{Number(list.valid_count).toLocaleString('es-CL')} válidos</span>
                      <span className="text-destructive">{Number(list.invalid_count).toLocaleString('es-CL')} inválidos</span>
                      <span>{Number(list.unverified_count).toLocaleString('es-CL')} sin verificar</span>
                    </div>
                    {list.status === 'processing' && (
                      <div className="mt-2">
                        <Progress value={Number(list.processing_progress)} className="h-1.5" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openImport(list.id as string, list.name as string)}>
                      <Upload className="w-3.5 h-3.5 mr-1" /> Importar
                    </Button>
                    {list.status === 'ready' && Number(list.unverified_count) > 0 && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/dashboard/verification?list=${list.id}`}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Verificar
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(list.id as string)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create list dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva lista</DialogTitle>
            <DialogDescription>Ingresa un nombre para tu nueva lista de emails.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Nombre</Label>
              <Input
                placeholder="Ej: Newsletter Q1 2025"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Crear lista
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Import dialog ── */}
      <Dialog open={importOpen} onOpenChange={v => { if (!importing) setImportOpen(v) }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importar a &quot;{importListName}&quot;</DialogTitle>
            <DialogDescription>Sube un archivo CSV/Excel o pega emails directamente.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="file" className="mt-2 flex flex-col flex-1 min-h-0">
            <TabsList className="w-full">
              <TabsTrigger value="file" className="flex-1 gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" /> Archivo
              </TabsTrigger>
              <TabsTrigger value="paste" className="flex-1 gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5" /> Copiar y pegar
              </TabsTrigger>
            </TabsList>

            {/* ── File tab ── */}
            <TabsContent value="file" className="flex flex-col gap-4 pt-3">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files[0]
                  if (f) selectFile(f)
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f) }}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-6 h-6 text-primary" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button
                      className="ml-2 text-muted-foreground hover:text-foreground"
                      onClick={e => { e.stopPropagation(); setFile(null) }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">Arrastra tu archivo aquí</p>
                    <p className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar</p>
                    <p className="text-xs text-muted-foreground mt-2">CSV, Excel (.xlsx/.xls) · máx 500 MB</p>
                  </>
                )}
              </div>

              {/* Column mapping */}
              {previewing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Leyendo columnas del archivo...
                </div>
              )}
              {preview && !importing && (
                <div className="flex flex-col gap-3 rounded-md border border-border p-3 bg-muted/30">
                  <p className="text-xs font-medium text-foreground">
                    Mapeo de columnas <span className="text-muted-foreground font-normal">— {preview.totalLines.toLocaleString('es-CL')} filas detectadas</span>
                  </p>
                  {/* Preview sample */}
                  {preview.sample.length > 0 && (
                    <div className="overflow-x-auto rounded border border-border">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="bg-muted">
                            {preview.headers.map((h, i) => (
                              <th key={i} className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap">{h || `Col ${i+1}`}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sample.map((row, ri) => (
                            <tr key={ri} className="border-t border-border">
                              {preview.headers.map((_, ci) => (
                                <td key={ci} className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{row[ci] ?? ''}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Selectors */}
                  <div className="grid grid-cols-3 gap-2">
                    {(['email', 'first_name', 'last_name'] as const).map(field => (
                      <div key={field} className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground">
                          {field === 'email' ? 'Email *' : field === 'first_name' ? 'Nombre' : 'Apellido'}
                        </label>
                        <Select
                          value={String(mapping[field])}
                          onValueChange={v => setMapping(prev => ({ ...prev, [field]: Number(v) }))}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="— ignorar —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="-1">— ignorar —</SelectItem>
                            {preview.headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>{h || `Columna ${i+1}`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              {importing && (
                <div className="flex flex-col gap-1.5">
                  <Progress value={importPct} className="h-1.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {importStep === 'parsing' && 'Procesando en navegador...'}
                      {importStep === 'saving'  && 'Guardando en base de datos...'}
                    </span>
                    <span>{importCount.toLocaleString('es-CL')} emails · {importPct}%</span>
                  </div>
                </div>
              )}

              {/* Live console */}
              {logs.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Terminal className="w-3 h-3" />
                    <span>Consola</span>
                  </div>
                  <ImportConsole logs={logs} />
                </div>
              )}

              <Button
                onClick={() => file && handleFileImport(file)}
                disabled={!file || importing || previewing || (!!preview && mapping.email === -1)}
                className="w-full"
              >
                {importing
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      {importStep === 'parsing' ? 'Procesando...' : 'Guardando...'}
                    </>
                  : <><Upload className="w-4 h-4 mr-1.5" /> Importar archivo</>
                }
              </Button>
            </TabsContent>

            {/* ── Paste tab ── */}
            <TabsContent value="paste" className="flex flex-col min-h-0 pt-3 flex-1">
              {/* Scrollable textarea area */}
              <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                <Label>Pega tus emails aquí</Label>
                <Textarea
                  placeholder={'usuario@ejemplo.com\notro@email.com\n...\n\nTambién funciona con comas o espacios.'}
                  className="flex-1 min-h-[180px] max-h-[40vh] font-mono text-xs resize-none overflow-y-auto"
                  value={pasteText}
                  onChange={e => {
                    setPasteText(e.target.value)
                    const { rows } = parsePastedEmails(e.target.value)
                    setPastePreview(rows.length)
                  }}
                />
                {pastePreview !== null && pastePreview > 0 && (
                  <p className="text-xs text-green-600">
                    {pastePreview.toLocaleString('es-CL')} emails válidos detectados
                  </p>
                )}
                {pastePreview === 0 && pasteText.length > 5 && (
                  <p className="text-xs text-destructive">No se detectaron emails válidos</p>
                )}
              </div>

              {/* Sticky bottom — always visible */}
              <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-border shrink-0">
                {importing && importStep === 'saving' && (
                  <div className="flex flex-col gap-1.5">
                    <Progress value={importPct} className="h-1.5" />
                    <p className="text-xs text-muted-foreground text-right">{importPct}%</p>
                  </div>
                )}
                {logs.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Terminal className="w-3 h-3" />
                      <span>Consola</span>
                    </div>
                    <ImportConsole logs={logs} />
                  </div>
                )}
                <Button
                  onClick={handlePasteImport}
                  disabled={!pasteText.trim() || importing || (pastePreview !== null && pastePreview === 0)}
                  className="w-full"
                >
                  {importing
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Guardando...</>
                    : <><ClipboardPaste className="w-4 h-4 mr-1.5" /> Importar {pastePreview ? `${pastePreview.toLocaleString('es-CL')} emails` : 'emails'}</>
                  }
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
