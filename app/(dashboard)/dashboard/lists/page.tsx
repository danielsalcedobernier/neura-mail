'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Upload, Plus, Trash2, FileText, Loader2, CheckCircle2,
  ClipboardPaste, FolderOpen, X, Terminal, Download, RefreshCw,
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface ColumnMapping { email: number; first_name: number; last_name: number }
interface PreviewData {
  headers: string[]
  sample: string[][]
  suggested: { email: number; first_name: number; last_name: number }
  totalLines: number
}

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
  info: 'text-muted-foreground',
  success: 'text-green-500',
  warn: 'text-yellow-500',
  error: 'text-destructive',
}
const levelPrefix: Record<LogLevel, string> = {
  info: '›', success: '✓', warn: '⚠', error: '✗',
}

function ImportConsole({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs])
  if (logs.length === 0) return null
  return (
    <div className="mt-3 rounded-md bg-black/80 p-3 font-mono text-xs max-h-40 overflow-y-auto space-y-0.5">
      {logs.map((l, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-muted-foreground shrink-0">{l.time}</span>
          <span className={`shrink-0 ${levelColor[l.level]}`}>{levelPrefix[l.level]}</span>
          <span className={levelColor[l.level]}>{l.msg}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)
const meFetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const statusBadge: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  processing: 'bg-yellow-500/10 text-yellow-600',
  ready: 'bg-green-500/10 text-green-600',
  error: 'bg-destructive/10 text-destructive',
}
const statusLabel: Record<string, string> = {
  pending: 'pendiente', processing: 'procesando', ready: 'lista', error: 'error',
}

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

function previewFile(file: File): Promise<PreviewData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/workers/csv-parser.worker.js')
    worker.onmessage = (e) => {
      if (e.data.type === 'preview') { worker.terminate(); resolve(e.data) }
      if (e.data.type === 'error') { worker.terminate(); reject(new Error(e.data.message)) }
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

export default function ListsPage() {
  const { data: lists, isLoading } = useSWR('/api/lists', fetcher, { refreshInterval: 5000 })
  const { data: me } = useSWR('/api/me', meFetcher)
  const isAdmin = !!me?.is_admin

  const [syncing, setSyncing] = useState(false)

  const handleSyncCounters = async () => {
    setSyncing(true)
    try {
      const jobsRes = await fetch('/api/admin/verification-jobs?status=completed')
      const jobsData = await jobsRes.json()
      const jobs: { id: string; list_id: string }[] = jobsData.data ?? []
      if (jobs.length === 0) { toast.info('No hay jobs completados para sincronizar'); return }

      let synced = 0
      for (const job of jobs) {
        const res = await fetch('/api/admin/sync-list-counters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId: job.list_id, jobId: job.id }),
        })
        if (res.ok) synced++
      }
      toast.success(`${synced} lista(s) sincronizadas`)
      mutate('/api/lists')
    } catch { toast.error('Error al sincronizar') }
    finally { setSyncing(false) }
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [importListId, setImportListId] = useState<string | null>(null)
  const [importListName, setImportListName] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importStep, setImportStep] = useState<'idle' | 'parsing' | 'saving'>('idle')
  const [importPct, setImportPct] = useState(0)
  const [importCount, setImportCount] = useState(0)

  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<number | null>(null)

  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [mapping, setMapping] = useState<ColumnMapping>({ email: -1, first_name: -1, last_name: -1 })

  const { logs, log, clear } = useImportLog()

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

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta lista y todos sus contactos?')) return
    const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Lista eliminada'); mutate('/api/lists') }
    else toast.error('Error al eliminar')
  }

  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadList, setDownloadList] = useState<{ id: string; name: string } | null>(null)
  const [downloadFilter, setDownloadFilter] = useState<'all' | 'valid'>('valid')
  const [downloading, setDownloading] = useState(false)
  const [downloadPct, setDownloadPct] = useState(0)

  const CHUNK_SIZE = 1_000_000

  const handleDownload = async () => {
    if (!downloadList) return
    setDownloading(true)
    setDownloadPct(0)
    try {
      const url = `/api/lists/${downloadList.id}/export?filter=${downloadFilter}`
      const response = await fetch(url)
      if (!response.ok || !response.body) throw new Error('Error al descargar')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const rows: string[][] = []
      let fileIndex = 1
      let totalRows = 0
      const header = 'email,first_name,last_name,verification_status'

      const flushFile = (chunk: string[][]) => {
        const csv = [header, ...chunk.map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        const suffix = fileIndex > 1 ? `_parte${fileIndex}` : ''
        a.download = `${downloadList!.name}${suffix}_${downloadFilter}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
        fileIndex++
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const obj = JSON.parse(line)
            rows.push([obj.email, obj.first_name ?? '', obj.last_name ?? '', obj.verification_status ?? ''])
            totalRows++
            if (rows.length >= CHUNK_SIZE) {
              flushFile(rows.splice(0, CHUNK_SIZE))
            }
          } catch { /* skip malformed */ }
        }
      }
      if (rows.length > 0) flushFile(rows)

      setDownloadPct(100)
      toast.success(`${totalRows.toLocaleString('es-CL')} emails descargados en ${fileIndex - 1} archivo${fileIndex > 2 ? 's' : ''}`)
      setDownloadOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al descargar')
    } finally {
      setDownloading(false)
      setDownloadPct(0)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Listas de email</h1>
          <p className="text-muted-foreground text-sm mt-1">Crea listas e importa contactos desde archivos o texto.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleSyncCounters} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar contadores
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva lista
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !lists?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No tienes listas aún</p>
            <p className="text-sm text-muted-foreground">Crea una lista para comenzar a importar contactos</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Crear lista
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {lists.map((list: Record<string, unknown>) => (
            <Card key={list.id as string}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">{list.name as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(list.total_contacts ?? 0).toLocaleString('es-CL')} contactos
                      {Number(list.valid_contacts ?? 0) > 0 && ` · ${Number(list.valid_contacts).toLocaleString('es-CL')} válidos`}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[list.status as string] || statusBadge.pending}`}>
                    {statusLabel[list.status as string] || list.status as string}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setDownloadList({ id: list.id as string, name: list.name as string })
                    setDownloadFilter('valid')
                    setDownloadOpen(true)
                  }}>
                    <Download className="h-4 w-4" />
                    Descargar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openImport(list.id as string, list.name as string)}>
                    <Upload className="h-4 w-4" />
                    Importar
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(list.id as string)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva lista</DialogTitle>
            <DialogDescription>Crea una nueva lista de emails para importar contactos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Nombre de la lista</Label>
              <Input
                placeholder="Ej: Clientes 2024"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear lista
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={v => { if (!importing) setImportOpen(v) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar contactos</DialogTitle>
            <DialogDescription>Lista: <span className="font-medium">{importListName}</span></DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="file">
            <TabsList className="w-full">
              <TabsTrigger value="file" className="flex-1">
                <FolderOpen className="h-4 w-4 mr-1.5" />Archivo CSV/TXT
              </TabsTrigger>
              <TabsTrigger value="paste" className="flex-1">
                <ClipboardPaste className="h-4 w-4 mr-1.5" />Pegar emails
              </TabsTrigger>
            </TabsList>

            {/* File tab */}
            <TabsContent value="file" className="space-y-4 pt-2">
              {!file ? (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) selectFile(f) }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="font-medium">Arrastra un archivo o haz clic para seleccionar</p>
                  <p className="text-sm text-muted-foreground">CSV, TXT — sin límite de tamaño</p>
                  <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f) }} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-md bg-muted">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </div>
                    <button onClick={() => { setFile(null); setPreview(null) }} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {previewing && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />Analizando columnas...
                    </div>
                  )}

                  {preview && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {preview.totalLines.toLocaleString('es-CL')} filas detectadas. Mapea las columnas:
                      </p>
                      {(['email', 'first_name', 'last_name'] as const).map(field => (
                        <div key={field} className="flex items-center gap-3">
                          <Label className="w-32 shrink-0 text-sm">
                            {field === 'email' ? 'Email *' : field === 'first_name' ? 'Nombre' : 'Apellido'}
                          </Label>
                          <Select
                            value={String(mapping[field])}
                            onValueChange={v => setMapping(m => ({ ...m, [field]: Number(v) }))}
                          >
                            <SelectTrigger className="flex-1 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="-1">— no incluir —</SelectItem>
                              {preview.headers.map((h, i) => (
                                <SelectItem key={i} value={String(i)}>{h || `Columna ${i + 1}`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}

                  {importing && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{importStep === 'parsing' ? 'Leyendo archivo...' : 'Guardando en BD...'}</span>
                        <span>{importPct}% · {importCount.toLocaleString('es-CL')} emails</span>
                      </div>
                      <Progress value={importPct} />
                    </div>
                  )}

                  <ImportConsole logs={logs} />

                  <Button
                    className="w-full"
                    disabled={importing || mapping.email === -1 || !preview}
                    onClick={() => file && handleFileImport(file)}
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {importing ? 'Importando...' : 'Importar contactos'}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Paste tab */}
            <TabsContent value="paste" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Pega emails (uno por línea, separados por coma, o en texto libre)</Label>
                <Textarea
                  rows={8}
                  placeholder="ejemplo@correo.com&#10;otro@dominio.com&#10;..."
                  value={pasteText}
                  onChange={e => {
                    setPasteText(e.target.value)
                    const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
                    const count = (e.target.value.match(EMAIL_RE) ?? []).length
                    setPastePreview(count)
                  }}
                />
                {pastePreview !== null && pastePreview > 0 && (
                  <p className="text-xs text-muted-foreground">{pastePreview.toLocaleString('es-CL')} emails detectados</p>
                )}
              </div>

              {importing && (
                <div className="space-y-1.5">
                  <Progress value={importPct} />
                </div>
              )}

              <ImportConsole logs={logs} />

              <Button
                className="w-full"
                disabled={importing || !pasteText.trim()}
                onClick={handlePasteImport}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {importing ? 'Importando...' : 'Importar emails'}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Download dialog */}
      <Dialog open={downloadOpen} onOpenChange={v => { if (!downloading) setDownloadOpen(v) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descargar lista</DialogTitle>
            <DialogDescription>Lista: <span className="font-medium">{downloadList?.name}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Filtro de descarga</Label>
              <RadioGroup value={downloadFilter} onValueChange={v => setDownloadFilter(v as 'all' | 'valid')}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="valid" id="valid" />
                  <Label htmlFor="valid" className="font-normal">Solo emails verificados como válidos</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="all" />
                  <Label htmlFor="all" className="font-normal">Todos los emails</Label>
                </div>
              </RadioGroup>
            </div>

            {downloading && <Progress value={downloadPct} />}

            <Button className="w-full" onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? 'Descargando...' : 'Descargar CSV'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
