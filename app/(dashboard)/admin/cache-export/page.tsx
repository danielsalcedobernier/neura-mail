'use client'

import { useState, useRef, useCallback } from 'react'
import { Download, Search, Database, List, FileDown, Square, CheckCircle2, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const CHUNK_SIZE = 100_000
const FILE_SIZE = 1_000_000

interface EmailList { id: string; name: string; total_count: number; user_email: string; user_name: string | null }
interface LogEntry { time: string; msg: string; type: 'info' | 'ok' | 'error' }

const ts = () => new Date().toLocaleTimeString('es-CL')

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const lines: string[] = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h] ?? ''; const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
  }
  return lines.join('\n')
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}

export default function CacheExportPage() {
  const [source, setSource] = useState<'cache' | 'list'>('cache')
  const [search, setSearch] = useState('')
  const [selectedList, setSelectedList] = useState<EmailList | null>(null)
  const [validatedOnly, setValidatedOnly] = useState(false)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [exported, setExported] = useState(0)
  const [fileCount, setFileCount] = useState(0)
  const [lists, setLists] = useState<EmailList[]>([])
  const [searching, setSearching] = useState(false)
  const stopRef = useRef(false)
  const logBottom = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev.slice(-299), { time: ts(), msg, type }])
    setTimeout(() => logBottom.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const searchLists = useCallback(async (q: string) => {
    setSearching(true)
    try {
      const res = await fetch('/api/admin/cache-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ search: q }) })
      const data = await res.json(); setLists(data.data ?? [])
    } finally { setSearching(false) }
  }, [])

  const stop = useCallback(() => { stopRef.current = true; setRunning(false); addLog('Exportación detenida.', 'error') }, [addLog])

  const startExport = useCallback(async () => {
    stopRef.current = false; setRunning(true); setLog([]); setExported(0); setFileCount(0)

    const params = new URLSearchParams({ action: 'count', source, validatedOnly: String(validatedOnly), ...(source === 'list' && selectedList ? { listId: selectedList.id } : {}) })
    addLog('Contando registros...', 'info')
    const countRes = await fetch(`/api/admin/cache-export?${params}`)
    const countData = await countRes.json(); const total = Number(countData.data?.count ?? 0)
    setTotalRows(total)
    if (total === 0) { addLog('No hay registros para exportar.', 'error'); setRunning(false); return }

    const sourceName = source === 'list' ? selectedList!.name : 'Cache Global'
    addLog(`${total.toLocaleString('es-CL')} registros encontrados en "${sourceName}".`, 'ok')
    addLog(`Se generarán ${Math.ceil(total / FILE_SIZE)} archivo(s) de máx. 1.000.000 filas.`, 'info')

    let offset = 0; let fileIndex = 1; let fileBuffer: Record<string, unknown>[] = []; let fileRows = 0; let totalExported = 0
    const cacheHeaders = ['email', 'status', 'score', 'is_disposable', 'is_catch_all', 'provider', 'verified_at', 'hit_count']
    const listHeaders = ['email', 'status', 'score']
    const headers = source === 'list' ? listHeaders : cacheHeaders

    const flushFile = (partial = false) => {
      if (fileBuffer.length === 0) return
      const csv = toCSV(fileBuffer, headers)
      const name = Math.ceil(total / FILE_SIZE) > 1 ? `export_${sourceName.replace(/\s+/g, '_')}_parte${fileIndex}.csv` : `export_${sourceName.replace(/\s+/g, '_')}.csv`
      downloadCSV(csv, name); addLog(`Archivo ${name} descargado (${fileBuffer.length.toLocaleString('es-CL')} filas).`, 'ok')
      setFileCount(prev => prev + 1); fileBuffer = []; fileRows = 0; if (!partial) fileIndex++
    }

    while (!stopRef.current) {
      const chunkParams = new URLSearchParams({ action: 'chunk', source, offset: String(offset), limit: String(CHUNK_SIZE), validatedOnly: String(validatedOnly), ...(source === 'list' && selectedList ? { listId: selectedList.id } : {}) })
      const res = await fetch(`/api/admin/cache-export?${chunkParams}`); const data = await res.json()
      if (!res.ok) { addLog(`Error en offset=${offset}: ${data.error ?? res.status}`, 'error'); break }
      const rows: Record<string, unknown>[] = data.data?.rows ?? []
      if (rows.length === 0) { addLog('Todos los registros exportados.', 'ok'); break }
      fileBuffer.push(...rows); fileRows += rows.length; totalExported += rows.length
      setExported(totalExported)
      addLog(`Chunk @${offset.toLocaleString('es-CL')}: ${rows.length.toLocaleString('es-CL')} filas (total: ${totalExported.toLocaleString('es-CL')})`, 'info')
      if (fileRows >= FILE_SIZE) flushFile()
      offset += CHUNK_SIZE
      if (!data.data?.hasMore) { addLog('Todos los chunks descargados.', 'ok'); break }
    }

    if (fileBuffer.length > 0) flushFile(true)
    setRunning(false); addLog(`Exportación completada. ${totalExported.toLocaleString('es-CL')} filas.`, 'ok')
  }, [source, selectedList, validatedOnly, addLog])

  const progress = totalRows > 0 ? Math.min(100, Math.round((exported / totalRows) * 100)) : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Exportar Cache</h1><p className="text-muted-foreground text-sm mt-1">Descarga el caché completo o una lista específica como CSV.</p></div>
        {running && <Button variant="destructive" size="sm" onClick={stop}><Square className="w-4 h-4 mr-1" />Detener</Button>}
      </div>

      {/* Source selector */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Fuente de datos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setSource('cache'); setSelectedList(null) }} className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${source === 'cache' ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/50'}`}>
              <Database className="w-5 h-5 shrink-0" /><div><p className="font-medium text-sm">Caché global</p><p className="text-xs">Todos los emails verificados</p></div>
            </button>
            <button onClick={() => { setSource('list'); searchLists('') }} className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${source === 'list' ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-muted-foreground hover:border-primary/50'}`}>
              <List className="w-5 h-5 shrink-0" /><div><p className="font-medium text-sm">Lista de usuario</p><p className="text-xs">Emails de una lista específica</p></div>
            </button>
          </div>

          <div className="flex items-center gap-2"><Switch checked={validatedOnly} onCheckedChange={setValidatedOnly} /><Label className="text-sm">Solo emails validados (valid + catch-all)</Label></div>

          {source === 'list' && (
            <div className="space-y-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar listas..." value={search} onChange={e => { setSearch(e.target.value); searchLists(e.target.value) }} /></div>
              {searching && <p className="text-xs text-muted-foreground">Buscando...</p>}
              {lists.length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {lists.map(list => (
                    <button key={list.id} onClick={() => setSelectedList(list)} className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors ${selectedList?.id === list.id ? 'bg-primary/5' : ''}`}>
                      <div><p className="font-medium">{list.name}</p><p className="text-xs text-muted-foreground">{list.user_email}</p></div>
                      <span className="text-xs text-muted-foreground">{Number(list.total_count ?? 0).toLocaleString('es-CL')}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedList && (
                <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /><span className="font-medium">{selectedList.name}</span>
                  <span className="text-muted-foreground">— {Number(selectedList.total_count ?? 0).toLocaleString('es-CL')} emails</span>
                  <button onClick={() => setSelectedList(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress */}
      {(running || exported > 0) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between text-sm"><span className="font-medium">Progreso</span><span>{progress}%</span></div>
            <div className="w-full bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
            <div className="flex gap-4 text-xs text-muted-foreground"><span>{exported.toLocaleString('es-CL')} / {totalRows.toLocaleString('es-CL')} filas</span>{fileCount > 0 && <span>{fileCount} archivo(s) descargado(s)</span>}</div>
          </CardContent>
        </Card>
      )}

      {!running && (
        <Button onClick={startExport} disabled={source === 'list' && !selectedList} className="w-full">
          <FileDown className="w-4 h-4 mr-2" />{source === 'cache' ? 'Exportar caché completo' : `Exportar "${selectedList?.name ?? 'lista'}"`}
        </Button>
      )}

      {/* Log */}
      {log.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Log de exportación</CardTitle></CardHeader>
          <CardContent>
            <div className="bg-muted/40 rounded p-3 h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {log.map((e, i) => <p key={i} className={e.type === 'ok' ? 'text-green-600' : e.type === 'error' ? 'text-destructive' : 'text-muted-foreground'}>[{e.time}] {e.msg}</p>)}
              <div ref={logBottom} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
