'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Play, Square, RefreshCw, Zap, Loader2, CheckCircle2 } from 'lucide-react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const CHUNK_SIZE   = 5000
const POLL_INTERVAL_MS = 30_000 // wait 30s between mails.so polls

type Job = {
  id: string
  list_id: string
  list_name: string
  status: string
  total_count: number
  pending_count: number
  processing_count: number
  completed_count: number
  mailsso_batch_id: string | null
}

type LogEntry = { time: string; msg: string; type: 'info' | 'ok' | 'error' | 'warn' }

function ts() {
  return new Date().toLocaleTimeString('es-CL', { hour12: false })
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export default function WorkerPage() {
  const { data: jobs, isLoading, mutate } = useSWR<Job[]>('/api/admin/worker/jobs', fetcher, { refreshInterval: 15000 })

  const [running, setRunning]       = useState(false)
  const autoStarted = useRef(false)
  const [log, setLog]               = useState<LogEntry[]>([])
  const [activeJob, setActiveJob]   = useState<Job | null>(null)
  const [phase, setPhase]           = useState<string>('')
  const [written, setWritten]       = useState(0)
  const [completed, setCompleted]   = useState(0)
  const [total, setTotal]           = useState(0)
  const [speed, setSpeed]           = useState(0)
  const [startedAt, setStartedAt]   = useState<number | null>(null)

  const stopRef    = useRef(false)
  const startRef   = useRef<(() => Promise<void>) | null>(null)
  const logBottom  = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev.slice(-299), { time: ts(), msg, type }])
  }, [])

  useEffect(() => {
    logBottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const stop = useCallback(() => {
    stopRef.current = true
    setRunning(false)
    setPhase('')
    addLog('Worker detenido por el usuario.', 'warn')
  }, [addLog])

  // ── Core: process one job end-to-end ──────────────────────────────────────
  const processJob = useCallback(async (job: Job) => {
    addLog(`── Iniciando job: ${job.list_name} (${job.id.slice(0, 8)}...)`, 'info')
    setActiveJob(job)
    setWritten(0)
    setTotal(Number(job.total_count))
    setCompleted(Number(job.completed_count))

    const t0 = Date.now()
    setStartedAt(t0)

    // ── Fase 1: Procesar todos los chunks pending (cache + submit) ──────────
    while (!stopRef.current) {
      setPhase('Verificando en caché...')
      addLog('Fase 1: Consultando caché y enviando a mails.so...', 'info')

      const submitRes = await fetch('/api/admin/worker/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, action: 'submit' }),
      })
      const submitData = await submitRes.json()

      if (!submitRes.ok) {
        addLog(`Error en submit: ${submitData.error ?? submitRes.status}`, 'error')
        return
      }

      const { submitted, cacheHits, batchId, done } = submitData.data ?? {}

      if (cacheHits > 0) {
        setCompleted(prev => prev + cacheHits)
        addLog(`Cache hits: ${Number(cacheHits).toLocaleString('es-CL')} emails resueltos desde caché.`, 'ok')
      }

      if (done) {
        // All remaining pending items were cache hits — nothing to submit
        addLog('Todos los emails resueltos desde caché. No se necesita mails.so.', 'ok')
        break
      }

      if (submitted === 0 && !batchId) {
        // No more pending items
        addLog('No hay más items pendientes.', 'ok')
        break
      }

      addLog(`Batch enviado a mails.so: ${Number(submitted).toLocaleString('es-CL')} emails | batch_id: ${batchId}`, 'ok')

      // ── Fase 2: Esperar resultados de mails.so (poll cada 30s) ─────────────
      setPhase('Esperando resultados de mails.so...')
      let resultsReady = false
      let pollAttempts = 0

      while (!stopRef.current && !resultsReady) {
        pollAttempts++
        addLog(`Poll #${pollAttempts}: consultando mails.so en ${POLL_INTERVAL_MS / 1000}s...`, 'info')
        await sleep(POLL_INTERVAL_MS)
        if (stopRef.current) break

        const pollRes = await fetch('/api/admin/worker/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id, action: 'poll' }),
        })
        const pollData = await pollRes.json()

        if (!pollRes.ok) {
          addLog(`Error en poll: ${pollData.error ?? pollRes.status}`, 'error')
          return
        }

        if (pollData.data?.ready) {
          const count = pollData.data?.count ?? 0
          addLog(`Resultados listos: ${Number(count).toLocaleString('es-CL')} registros recibidos de mails.so.`, 'ok')
          resultsReady = true
        } else {
          addLog(`Batch aún procesando en mails.so. Reintentando en ${POLL_INTERVAL_MS / 1000}s...`, 'warn')
        }
      }

      if (!resultsReady || stopRef.current) break

      // ── Fase 3: Escribir resultados en chunks ─────────────────────────────
      setPhase('Escribiendo resultados...')
      addLog('Fase 3: Escribiendo resultados en chunks de 5.000...', 'info')

      let offset     = 0
      let chunkCount = 0

      while (!stopRef.current) {
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

        const { written: w, done: chunkDone, batchDone } = chunkData.data ?? {}
        chunkCount++
        const rowsWritten = w ?? 0
        offset += CHUNK_SIZE

        setWritten(prev => prev + rowsWritten)
        setCompleted(prev => prev + rowsWritten)

        const elapsed = (Date.now() - t0) / 1000
        const totalWritten = written + rowsWritten
        const rps = elapsed > 0 ? Math.round(totalWritten / elapsed) : 0
        setSpeed(rps)

        addLog(
          `Chunk ${chunkCount} (offset=${offset - CHUNK_SIZE}): ${rowsWritten} filas escritas | ${rps}/s`,
          rowsWritten > 0 ? 'ok' : 'info'
        )

        if (batchDone || rowsWritten === 0) {
          addLog(`Batch escrito completamente. ${chunkCount} chunks procesados.`, 'ok')
          break
        }
      }

      // After writing this batch, loop back to check for more pending items
      if (!stopRef.current) {
        addLog('Verificando si quedan items pendientes...', 'info')
        // Small pause to not hammer the DB
        await sleep(1000)
      }
    }

    if (!stopRef.current) {
      addLog(`Job "${job.list_name}" completado.`, 'ok')
    }
  }, [addLog, written])

  const start = useCallback(async () => {
    const pendingJobs = jobs?.filter(j => j.status !== 'completed') ?? []
    if (pendingJobs.length === 0) {
      addLog('No hay jobs activos (queued/running) para procesar.', 'warn')
      return
    }
    stopRef.current = false
    setRunning(true)
    setLog([])
    addLog(`Worker iniciado. ${pendingJobs.length} job(s) en cola.`, 'info')

    for (const job of pendingJobs) {
      if (stopRef.current) break
      await processJob(job)
      await mutate()
    }

    if (!stopRef.current) {
      addLog('Todos los jobs procesados.', 'ok')
      setRunning(false)
      setPhase('')
    }
    setActiveJob(null)
  }, [jobs, processJob, addLog, mutate])

  // Keep ref in sync — must be after `start` is declared
  useEffect(() => { startRef.current = start }, [start])

  // Auto-start when jobs load and there are pending jobs
  useEffect(() => {
    if (!autoStarted.current && !isLoading && jobs && !running && startRef.current) {
      const pending = jobs.filter(j => j.status !== 'completed')
      if (pending.length > 0) {
        autoStarted.current = true
        startRef.current()
      }
    }
  }, [jobs, isLoading, running])

  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const eta = speed > 0 && total > completed
    ? Math.round((total - completed) / speed)
    : null

  const pendingJobs  = jobs?.filter(j => j.status !== 'completed') ?? []
  const completedJobs = jobs?.filter(j => j.status === 'completed') ?? []

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Worker de Verificación</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Corre en el navegador. Hace cache check, envío a mails.so, polling y escritura — sin límite de tiempo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={running}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Actualizar
          </Button>
          {running && (
            <Button variant="destructive" onClick={stop}>
              <Square className="w-4 h-4 mr-1.5" /> Detener
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Jobs pendientes</p>
            <p className="text-3xl font-bold mt-1">{pendingJobs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fase actual</p>
            <p className="text-sm font-medium mt-1 truncate">{phase || (running ? 'Iniciando...' : '—')}</p>
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
                {completed.toLocaleString('es-CL')} / {total.toLocaleString('es-CL')} emails
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="h-3" />
            <p className="text-xs text-muted-foreground mt-1">{progress}% completado</p>
          </CardContent>
        </Card>
      )}

      {/* Job list */}
      {!running && (
        <div className="space-y-3">
          {pendingJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Jobs en cola ({pendingJobs.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                  </div>
                ) : (
                  <div className="divide-y">
                    {pendingJobs.map(job => {
                      const pct = Number(job.total_count) > 0
                        ? Math.round((Number(job.completed_count) / Number(job.total_count)) * 100)
                        : 0
                      return (
                        <div key={job.id} className="py-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{job.list_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {Number(job.completed_count).toLocaleString('es-CL')} / {Number(job.total_count).toLocaleString('es-CL')} completados
                                {job.mailsso_batch_id && <span className="ml-2 text-blue-500">· batch activo en mails.so</span>}
                              </p>
                            </div>
                            <Badge variant={job.status === 'running' ? 'default' : 'secondary'} className="text-xs">
                              {job.status}
                            </Badge>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {completedJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-muted-foreground">Completados recientemente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {completedJobs.slice(0, 5).map(job => (
                    <div key={job.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium">{job.list_name}</p>
                        <p className="text-xs text-muted-foreground">{Number(job.total_count).toLocaleString('es-CL')} emails</p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
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
            <ScrollArea className="h-80 font-mono text-xs px-4">
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
