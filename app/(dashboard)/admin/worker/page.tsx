'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Play, Square, RefreshCw, Zap, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

type Job = {
  id: string
  list_id: string
  list_name: string
  user_email: string
  status: string
  total_count: number
  processed_count: number
  mailsso_batch_id: string | null
  result_written: number
}

type LogEntry = { time: string; msg: string; type: 'info' | 'ok' | 'error' | 'warn' }

const CHUNK_SIZE = 5000

function ts() {
  return new Date().toLocaleTimeString('es-CL', { hour12: false })
}

export default function WorkerPage() {
  const { data: jobs, isLoading, mutate } = useSWR<Job[]>('/api/admin/worker/jobs', fetcher, { refreshInterval: 10000 })

  const [running, setRunning]         = useState(false)
  const [log, setLog]                 = useState<LogEntry[]>([])
  const [activeJob, setActiveJob]     = useState<Job | null>(null)
  const [written, setWritten]         = useState(0)
  const [speed, setSpeed]             = useState(0)
  const [startedAt, setStartedAt]     = useState<number | null>(null)

  const stopRef    = useRef(false)
  const logBottom  = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev.slice(-199), { time: ts(), msg, type }])
  }, [])

  useEffect(() => {
    logBottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const stop = useCallback(() => {
    stopRef.current = true
    setRunning(false)
    addLog('Worker detenido por el usuario.', 'warn')
  }, [addLog])

  const processJob = useCallback(async (job: Job) => {
    addLog(`Iniciando job: ${job.list_name} (${job.id.slice(0, 8)}...)`, 'info')
    setActiveJob(job)
    setWritten(0)

    // ── Step 1: Poll mails.so if not yet fetched ─────────────────────────────
    if (!job.mailsso_batch_id) {
      addLog(`Job ${job.id.slice(0, 8)} no tiene batch_id en mails.so, omitiendo.`, 'warn')
      return
    }

    addLog(`Consultando resultados a mails.so para batch ${job.mailsso_batch_id}...`, 'info')
    const pollRes = await fetch('/api/admin/worker/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id }),
    })
    const pollData = await pollRes.json()

    if (!pollRes.ok) {
      addLog(`Error al consultar mails.so: ${pollData.error ?? pollRes.status}`, 'error')
      return
    }
    if (pollData.data?.status === 'processing') {
      addLog(`Batch todavía procesando en mails.so. Intenta más tarde.`, 'warn')
      return
    }

    const total: number = pollData.data?.total ?? 0
    addLog(`Resultados disponibles: ${total.toLocaleString('es-CL')} registros. Iniciando escritura en chunks de ${CHUNK_SIZE.toLocaleString('es-CL')}...`, 'ok')

    // ── Step 2: Write in chunks ───────────────────────────────────────────────
    let offset     = 0
    let totalWritten = 0
    const t0       = Date.now()
    setStartedAt(t0)

    while (true) {
      if (stopRef.current) break

      const chunkRes = await fetch('/api/admin/worker/write-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, offset, limit: CHUNK_SIZE }),
      })
      const chunkData = await chunkRes.json()

      if (!chunkRes.ok) {
        addLog(`Error en chunk offset=${offset}: ${chunkData.error ?? chunkRes.status}`, 'error')
        break
      }

      const { rowsWritten, done } = chunkData.data ?? {}
      totalWritten += rowsWritten ?? 0
      offset += CHUNK_SIZE
      setWritten(totalWritten)

      const elapsed = (Date.now() - t0) / 1000
      const rps     = elapsed > 0 ? Math.round(totalWritten / elapsed) : 0
      setSpeed(rps)

      addLog(
        `Chunk offset=${offset - CHUNK_SIZE}: ${rowsWritten} filas escritas | total=${totalWritten.toLocaleString('es-CL')} | ${rps} filas/seg`,
        rowsWritten > 0 ? 'ok' : 'info'
      )

      if (done || rowsWritten === 0) {
        addLog(`Job ${job.list_name} completado. ${totalWritten.toLocaleString('es-CL')} filas escritas en total.`, 'ok')
        break
      }
    }
  }, [addLog])

  const start = useCallback(async () => {
    if (!jobs || jobs.length === 0) { addLog('No hay jobs activos para procesar.', 'warn'); return }
    stopRef.current = false
    setRunning(true)
    setLog([])
    addLog('Worker iniciado.', 'info')

    for (const job of jobs) {
      if (stopRef.current) break
      await processJob(job)
      mutate()
    }

    if (!stopRef.current) {
      addLog('Todos los jobs procesados.', 'ok')
      setRunning(false)
    }
    setActiveJob(null)
  }, [jobs, processJob, addLog, mutate])

  const activeProgress = activeJob
    ? Math.min(100, Math.round((written / (activeJob.total_count || 1)) * 100))
    : 0

  const eta = speed > 0 && activeJob
    ? Math.round(((activeJob.total_count - written) / speed))
    : null

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Worker de Verificación</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Procesa los resultados de mails.so directamente desde el navegador, sin límite de tiempo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={running}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Actualizar jobs
          </Button>
          {!running ? (
            <Button onClick={start} disabled={isLoading || !jobs?.length}>
              <Play className="w-4 h-4 mr-1.5" /> Iniciar worker
            </Button>
          ) : (
            <Button variant="destructive" onClick={stop}>
              <Square className="w-4 h-4 mr-1.5" /> Detener
            </Button>
          )}
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Jobs pendientes</p>
            <p className="text-3xl font-bold mt-1">{jobs?.length ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Job activo</p>
            <p className="text-sm font-semibold mt-1 truncate">{activeJob?.list_name ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Velocidad</p>
            <p className="text-3xl font-bold mt-1">{speed > 0 ? `${speed.toLocaleString('es-CL')}/s` : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">ETA</p>
            <p className="text-3xl font-bold mt-1">
              {eta != null ? (eta > 60 ? `${Math.round(eta / 60)}m` : `${eta}s`) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active job progress */}
      {activeJob && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {activeJob.list_name}
              <span className="text-muted-foreground font-normal text-sm">
                — {written.toLocaleString('es-CL')} / {activeJob.total_count.toLocaleString('es-CL')} filas
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={activeProgress} className="h-3" />
            <p className="text-xs text-muted-foreground mt-1">{activeProgress}% completado</p>
          </CardContent>
        </Card>
      )}

      {/* Pending jobs list */}
      {!running && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs en cola</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
              </div>
            ) : !jobs?.length ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <CheckCircle2 className="w-4 h-4 text-green-500" /> No hay jobs pendientes de procesar.
              </div>
            ) : (
              <div className="divide-y">
                {jobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-sm">{job.list_name}</p>
                      <p className="text-xs text-muted-foreground">{job.user_email} · {Number(job.total_count).toLocaleString('es-CL')} contactos</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Log */}
      {log.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" /> Log en tiempo real
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-72 font-mono text-xs px-4">
              {log.map((entry, i) => (
                <div key={i} className={`py-0.5 flex gap-2 ${
                  entry.type === 'ok'    ? 'text-green-600 dark:text-green-400' :
                  entry.type === 'error' ? 'text-red-500' :
                  entry.type === 'warn'  ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-muted-foreground'
                }`}>
                  <span className="opacity-50 shrink-0">{entry.time}</span>
                  <span>{entry.msg}</span>
                </div>
              ))}
              <div ref={logBottom} />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
