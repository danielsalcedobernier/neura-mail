'use client'

import { useState, useRef, useCallback } from 'react'
import { Download, Search, Database, List, FileDown, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? d)

const CHUNK_SIZE  = 100_000  // rows per request
const FILE_SIZE   = 1_000_000 // rows per CSV file

interface EmailList {
  id: string
  name: string
  total_count: number
  user_email: string
  user_name: string | null
}

interface LogEntry { time: string; msg: string; type: 'info' | 'ok' | 'error' }

const ts = () => new Date().toLocaleTimeString('es-CL')

function toCSV(rows: Record<string, unknown>[], headers: string[]): string {
  const lines: string[] = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h] ?? ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
  }
  return lines.join('\n')
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function CacheExportPage() {
  const [source, setSource]       = useState<'cache' | 'list'>('cache')
  const [search, setSearch]       = useState('')
  const [selectedList, setSelectedList] = useState<EmailList | null>(null)
  const [running, setRunning]     = useState(false)
  const [log, setLog]             = useState<LogEntry[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [exported, setExported]   = useState(0)
  const [fileCount, setFileCount] = useState(0)

  const stopRef   = useRef(false)
  const logBottom = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev.slice(-299), { time: ts(), msg, type }])
    setTimeout(() => logBottom.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  // Search lists
  const [lists, setLists] = useState<EmailList[]>([])
  const [searching, setSearching] = useState(false)
  const searchLists = useCallback(async (q: string) => {
    setSearching(true)
    try {
      const res = await fetch('/api/admin/cache-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: q }),
      })
      const data = await res.json()
      setLists(data.data ?? [])
    } finally {
      setSearching(false)
    }
  }, [])

  const stop = useCallback(() => {
    stopRef.current = true
    setRunning(false)
    addLog('Exportación detenida por el usuario.', 'error')
  }, [addLog])

  const startExport = useCallback(async () => {
    stopRef.current = false
    setRunning(true)
    setLog([])
    setExported(0)
    setFileCount(0)

    const params = new URLSearchParams({
      action: 'count',
      source,
      ...(source === 'list' && selectedList ? { listId: selectedList.id } : {}),
    })

    addLog(`Contando registros...`, 'info')
    const countRes = await fetch(`/api/admin/cache-export?${params}`)
    const countData = await countRes.json()
    const total = Number(countData.data?.count ?? 0)
    setTotalRows(total)

    if (total === 0) {
      addLog('No hay registros para exportar.', 'error')
      setRunning(false)
      return
    }

    const sourceName = source === 'list' ? selectedList!.name : 'Cache Global'
    addLog(`${total.toLocaleString('es-CL')} registros encontrados en "${sourceName}".`, 'ok')
    addLog(`Se generarán ${Math.ceil(total / FILE_SIZE)} archivo(s) CSV de máx. 1.000.000 filas.`, 'info')

    let offset       = 0
    let fileIndex    = 1
    let fileBuffer: Record<string, unknown>[] = []
    let fileRows     = 0
    let totalExported = 0

    const cacheHeaders = ['email', 'status', 'score', 'is_disposable', 'is_catch_all', 'provider', 'verified_at', 'hit_count']
    const listHeaders  = ['email', 'status', 'score']
    const headers = source === 'list' ? listHeaders : cacheHeaders

    const flushFile = (partial = false) => {
      if (fileBuffer.length === 0) return
      const csv  = toCSV(fileBuffer, headers)
      const name = Math.ceil(total / FILE_SIZE) > 1
        ? `export_${sourceName.replace(/\s+/g, '_')}_parte${fileIndex}.csv`
        : `export_${sourceName.replace(/\s+/g, '_')}.csv`
      downloadCSV(csv, name)
      addLog(`Archivo ${name} descargado (${fileBuffer.length.toLocaleString('es-CL')} filas).`, 'ok')
      setFileCount(prev => prev + 1)
      fileBuffer = []
      fileRows   = 0
      if (!partial) fileIndex++
    }

    while (!stopRef.current) {
      const chunkParams = new URLSearchParams({
        action: 'chunk',
        source,
        offset: String(offset),
        limit: String(CHUNK_SIZE),
        ...(source === 'list' && selectedList ? { listId: selectedList.id } : {}),
      })

      const res  = await fetch(`/api/admin/cache-export?${chunkParams}`)
      const data = await res.json()

      if (!res.ok) {
        addLog(`Error en offset=${offset}: ${data.error ?? res.status}`, 'error')
        break
      }

      const rows: Record<string, unknown>[] = data.data?.rows ?? []
      if (rows.length === 0) {
        addLog('Todos los registros exportados.', 'ok')
        break
      }

      fileBuffer.push(...rows)
      fileRows     += rows.length
      totalExported += rows.length
      setExported(totalExported)

      addLog(`Chunk @${offset.toLocaleString('es-CL')}: ${rows.length.toLocaleString('es-CL')} filas (total: ${totalExported.toLocaleString('es-CL')})`, 'info')

      // If buffer reached 1M rows, flush to file
      if (fileRows >= FILE_SIZE) {
        flushFile()
      }

      offset += CHUNK_SIZE

      if (!data.data?.hasMore) {
        addLog('Todos los chunks descargados.', 'ok')
        break
      }
    }

    // Flush remaining buffer
    if (fileBuffer.length > 0) flushFile(true)

    setRunning(false)
    addLog(`Exportación completada. ${totalExported.toLocaleString('es-CL')} filas en ${fileCount + 1} archivo(s).`, 'ok')
  }, [source, selectedList, addLog, fileCount])

  const progress = totalRows > 0 ? Math.min(100, Math.round((exported / totalRows) * 100)) : 0

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exportar Cache</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Descarga el caché completo o una lista específica como CSV. El navegador procesa todo — sin timeouts.
          </p>
        </div>
        {running && (
          <Button variant="destructive" onClick={stop} size="sm">
            <Square className="w-4 h-4 mr-1.5" /> Detener
          </Button>
        )}
      </div>

      {/* Source selector */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <p className="text-sm font-medium text-foreground">Fuente de datos</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setSource('cache'); setSelectedList(null) }}
            className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${
              source === 'cache'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'
            }`}
          >
            <Database className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-medium text-sm">Caché global</div>
              <div className="text-xs opacity-70">Todos los emails verificados</div>
            </div>
          </button>
          <button
            onClick={() => { setSource('list'); searchLists('') }}
            className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${
              source === 'list'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'
            }`}
          >
            <List className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-medium text-sm">Lista de usuario</div>
              <div className="text-xs opacity-70">Emails de una lista específica</div>
            </div>
          </button>
        </div>

        {/* List picker */}
        {source === 'list' && (
          <div className="space-y-3 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar lista por nombre o usuario..."
                className="pl-9"
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  searchLists(e.target.value)
                }}
              />
            </div>

            {searching && <p className="text-xs text-muted-foreground">Buscando...</p>}

            {lists.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {lists.map(list => (
                  <button
                    key={list.id}
                    onClick={() => setSelectedList(list)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors ${
                      selectedList?.id === list.id ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div>
                      <div className="font-medium text-foreground">{list.name}</div>
                      <div className="text-xs text-muted-foreground">{list.user_email}</div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">
                      {Number(list.total_count ?? 0).toLocaleString('es-CL')} emails
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedList && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                <List className="w-4 h-4 text-primary" />
                <span className="font-medium text-primary">{selectedList.name}</span>
                <span className="text-muted-foreground">— {Number(selectedList.total_count ?? 0).toLocaleString('es-CL')} emails</span>
                <button onClick={() => setSelectedList(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress */}
      {(running || exported > 0) && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-foreground">Progreso</span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{exported.toLocaleString('es-CL')} / {totalRows.toLocaleString('es-CL')} filas</span>
            {fileCount > 0 && <span>{fileCount} archivo(s) descargado(s)</span>}
          </div>
        </div>
      )}

      {/* Start button */}
      {!running && (
        <Button
          onClick={startExport}
          disabled={source === 'list' && !selectedList}
          className="w-full"
          size="lg"
        >
          <FileDown className="w-4 h-4 mr-2" />
          {source === 'cache' ? 'Exportar caché completo' : `Exportar "${selectedList?.name ?? 'lista'}"`}
        </Button>
      )}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Download className="w-4 h-4" /> Log de exportación
          </p>
          <div className="bg-muted/50 rounded-lg p-3 h-52 overflow-y-auto font-mono text-xs space-y-1">
            {log.map((e, i) => (
              <div key={i} className={
                e.type === 'ok'    ? 'text-green-600' :
                e.type === 'error' ? 'text-red-500'   : 'text-muted-foreground'
              }>
                <span className="opacity-60">[{e.time}]</span> {e.msg}
              </div>
            ))}
            <div ref={logBottom} />
          </div>
        </div>
      )}
    </div>
  )
}
