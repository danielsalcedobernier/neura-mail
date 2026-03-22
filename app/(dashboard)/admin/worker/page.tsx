'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Square, RefreshCw, Zap, Loader2, CheckCircle2, Database, Send } from 'lucide-react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const CACHE_BATCH_SIZE  = 1000   // items per cache-check request
const MISS_QUEUE_LIMIT  = 5000   // trigger consumer when queue reaches this size
const POLL_INTERVAL_MS  = 30_000 // wait between mails.so polls
const MAX_CONSUMER_JOBS = 2      // max parallel mails.so batches in flight

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
type MissItem = { id: string; email: string }

function ts() {
  return new Date().toLocaleTimeString('es-CL', { hour12: false })
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export default function WorkerPage() {
  const { data: jobs, isLoading, mutate } = useSWR<Job[]>('/api/admin/worker/jobs', fetcher, { refreshInterval: 10000 })

  const [running, setRunning]     = useState(false)
  const autoStarted               = useRef(false)
  const [log, setLog]             = useState<LogEntry[]>([])
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [phase, setPhase]         = useState<string>('')
  const [cacheHits, setCacheHits] = useState(0)
  const [mailssoHits, setMailssoHits] = useState(0)
  const [queueSize, setQueueSize] = useState(0)
  const [inFlight, setInFlight]   = useState(0)
  const [total, setTotal]         = useState(0)
  const [speed, setSpeed]         = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const stopRef    = useRef(false)
  const startRef   = useRef<(() => Promise<void>) | null>(null)
  const logBottom  = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev.slice(-499), { time: ts(), msg, type }])
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

  // ── Consumer: handles one miss-batch end-to-end ──────────────────────────
  const consumeBatch = useCallback(async (jobId: string, missItems: MissItem[]): Promise<number> => {
    // Submit to mails.so
    const submitRes = await fetch('/api/admin/worker/submit-mailsso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, action: 'submit', items: missItems }),
    })
    const submitData = await submitRes.json()
    if (!submitRes.ok || !submitData.data?.batchId) {
      addLog(`Error enviando batch a mails.so: ${submitData.error ?? submitRes.status}`, 'error')
      return 0
    }
    const batchId = submitData.data.batchId
    addLog(`Batch enviado a mails.so: ${missItems.length.toLocaleString('es-CL')} emails | id: ${batchId}`, 'ok')
    setInFlight(prev => prev + 1)

    // Poll until ready
    let ready = false
    let attempts = 0
    while (!stopRef.current && !ready) {
      attempts++
      addLog(`Batch ${batchId.slice(0, 8)}... — poll #${attempts}, esperando ${POLL_INTERVAL_MS / 1000}s`, 'info')
      await sleep(POLL_INTERVAL_MS)
      if (stopRef.current) break

      const pollRes = await fetch('/api/admin/worker/submit-mailsso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action: 'poll', batchId }),
      })
      const pollData = await pollRes.json()

      if (pollData.data?.ready) {
        const written = pollData.data.written ?? 0
        addLog(`Batch ${batchId.slice(0, 8)}... listo. ${written.toLocaleString('es-CL')} emails escritos.`, 'ok')
        setMailssoHits(prev => prev + written)
        setInFlight(prev => Math.max(0, prev - 1))
        ready = true
        return written
      } else {
        addLog(`Batch ${batchId.slice(0, 8)}... aún procesando en mails.so.`, 'warn')
      }
    }

    setInFlight(prev => Math.max(0, prev - 1))
    return 0
  }, [addLog])

  // ── Core: process one job with producer/consumer pipeline ────────────────
  const processJob = useCallback(async (job: Job) => {
    addLog(`── Iniciando job: ${job.list_name} (${job.id.slice(0, 8)}...)`, 'info')
    setActiveJob(job)
    setCacheHits(0)
    setMailssoHits(0)
    setQueueSize(0)
    setInFlight(0)
    setTotal(Number(job.total_count))
    setStartedAt(Date.now())

    const missQueue: MissItem[] = []
    const consumerPromises: Promise<number>[] = []

    // ── Producer loop: cache-check batch by batch ──────────────────────────
    setPhase('Productor: verificando en caché...')

    let producerDone = false
    while (!stopRef.current && !producerDone) {
      const res = await fetch('/api/admin/worker/cache-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, batchSize: CACHE_BATCH_SIZE }),
      })
      const data = await res.json()
      if (!res.ok) {
        addLog(`Error en cache-check: ${data.error ?? res.status}`, 'error')
        break
      }

      const { done, cacheHits: hits, misses, remaining } = data.data ?? {}

      if (hits > 0) {
        setCacheHits(prev => {
          const next = prev + hits
          // update speed
          const elapsed = (Date.now() - (startedAt ?? Date.now())) / 1000
          if (elapsed > 0) setSpeed(Math.round(next / elapsed))
          return next
        })
        addLog(`Cache: +${hits} hits (lote de ${CACHE_BATCH_SIZE})`, 'ok')
      }

      if (misses && misses.length > 0) {
        missQueue.push(...misses)
        setQueueSize(missQueue.length)
        addLog(`Cola misses: ${missQueue.length} emails pendientes de mails.so`, 'info')
      }

      // Trigger consumer when queue is big enough and not too many in flight
      while (missQueue.length >= MISS_QUEUE_LIMIT && consumerPromises.length < MAX_CONSUMER_JOBS && !stopRef.current) {
        const batch = missQueue.splice(0, MISS_QUEUE_LIMIT)
        setQueueSize(missQueue.length)
        addLog(`Consumidor: enviando batch de ${batch.length} a mails.so...`, 'info')
        consumerPromises.push(consumeBatch(job.id, batch))
      }

      if (done && !remaining) {
        producerDone = true
        addLog(`Productor terminado. Cola restante: ${missQueue.length} misses.`, 'ok')
      }

      // Small pause to avoid hammering DB
      if (!done && !stopRef.current) await sleep(200)
    }

    // Flush remaining misses from queue (< MISS_QUEUE_LIMIT)
    while (missQueue.length > 0 && !stopRef.current) {
      const batch = missQueue.splice(0, MISS_QUEUE_LIMIT)
      setQueueSize(missQueue.length)
      addLog(`Consumidor: flushing ${batch.length} emails restantes a mails.so...`, 'info')
      consumerPromises.push(consumeBatch(job.id, batch))
    }

    // Wait for all consumer batches to finish
    if (consumerPromises.length > 0) {
      setPhase('Esperando resultados de mails.so...')
      addLog(`Esperando ${consumerPromises.length} batch(es) de mails.so...`, 'info')
      await Promise.all(consumerPromises)
    }

    // Finalize job (update counters + status = completed)
    setPhase('Finalizando job...')
    addLog('Finalizando job y actualizando contadores...', 'info')
    const finalRes = await fetch('/api/admin/worker/write-chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, offset: 0, limit: 5000 }),
    })
    const finalData = await finalRes.json()
    if (!finalRes.ok) {
      addLog(`Error al finalizar: ${finalData.error ?? finalRes.status}`, 'error')
    } else {
      addLog(`Job "${job.list_name}" finalizado. Contadores actualizados.`, 'ok')
    }

    await mutate()
    setActiveJob(null)
    setPhase('')
  }, [addLog, consumeBatch, mutate, startedAt])

  const start = useCallback(async () => {
    const pendingJobs = jobs?.filter(j => j.status !== 'completed') ?? []
    if (pendingJobs.length === 0) {
      addLog('No hay jobs activos para procesar.', 'warn')
      return
    }
    stopRef.current = false
    setRunning(true)
    setLog([])
    addLog(`Worker iniciado. ${pendingJobs.length} job(s) en cola.`, 'info')
    addLog(`Pipeline: productor (cache ${CACHE_BATCH_SIZE}/lote) + consumidor (mails.so ${MISS_QUEUE_LIMIT}/batch, max ${MAX_CONSUMER_JOBS} en paralelo)`, 'info')

    for (const job of pendingJobs) {
      if (stopRef.current) break
      await processJob(job)
    }

    if (!stopRef.current) {
      addLog('Todos los jobs procesados.', 'ok')
      setRunning(false)
      setPhase('')
    }
  }, [jobs, processJob, addLog])

  // Keep ref in sync (avoids TDZ in auto-start effect)
  useEffect(() => { startRef.current = start }, [start])

  // Auto-start on load if there are pending jobs
  useEffect(() => {
    if (!autoStarted.current && !isLoading && jobs && !running && startRef.current) {
      const pending = jobs.filter(j => j.status !== 'completed')
      if (pending.length > 0) {
        autoStarted.current = true
        startRef.current()
      }
    }
  }, [jobs, isLoading, running])

  const completed   = cacheHits + mailssoHits
  const progress    = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const eta         = speed > 0 && total > completed ? Math.round((total - completed) / speed) : null

  const pendingJobs   = jobs?.filter(j => j.status !== 'completed') ?? []
  const completedJobs = jobs?.filter(j => j.status === 'completed') ?? []

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Worker de Verificación</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pipeline productor/consumidor — caché en paralelo con envío a mails.so.
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Database className="w-3 h-3" /> Cache hits
            </p>
            <p className="text-3xl font-bold mt-1">{cacheHits > 0 ? cacheHits.toLocaleString('es-CL') : (running ? '…' : '—')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Send className="w-3 h-3" /> Mails.so
            </p>
            <p className="text-3xl font-bold mt-1">{mailssoHits > 0 ? mailssoHits.toLocaleString('es-CL') : (running ? '…' : '—')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cola / En vuelo</p>
            <p className="text-3xl font-bold mt-1">
              {running ? `${queueSize.toLocaleString('es-CL')} / ${inFlight}` : '—'}
            </p>
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

      {/* Active job */}
      {activeJob && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {activeJob.list_name}
              <span className="text-muted-foreground font-normal text-sm">
                {phase}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progress} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completed.toLocaleString('es-CL')} / {total.toLocaleString('es-CL')} emails</span>
              <span>{progress}%</span>
            </div>
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
                        ? Math.round((Number(job.completed_count) / Number(job.total_count)) * 100) : 0
                      return (
                        <div key={job.id} className="py-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{job.list_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {Number(job.completed_count).toLocaleString('es-CL')} / {Number(job.total_count).toLocaleString('es-CL')} completados
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
