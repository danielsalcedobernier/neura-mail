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
const CACHE_BATCH_SIZE = 10_000
const MISS_QUEUE_LIMIT = 10_000
const POLL_INTERVAL_MS = 30_000
const MAX_CONSUMER_JOBS = 2

type Job = { id: string; list_id: string; list_name: string; status: string; total_count: number; pending_count: number; processing_count: number; completed_count: number; mailsso_batch_id: string | null }
type LogEntry = { time: string; msg: string; type: 'info' | 'ok' | 'error' | 'warn' }
type MissItem = { id: string; email: string }

function ts() { return new Date().toLocaleTimeString('es-CL', { hour12: false }) }
function sleep(ms: number) { return new Promise<void>(resolve => setTimeout(resolve, ms)) }

export default function WorkerPage() {
  const { data: jobs, isLoading, mutate } = useSWR<Job[]>('/api/admin/worker/jobs', fetcher, { refreshInterval: 10000 })
  const [running, setRunning] = useState(false)
  const autoStarted = useRef(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [phase, setPhase] = useState<string>('')
  const [cacheHits, setCacheHits] = useState(0)
  const [mailssoHits, setMailssoHits] = useState(0)
  const [queueSize, setQueueSize] = useState(0)
  const [inFlight, setInFlight] = useState(0)
  const [total, setTotal] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const stopRef = useRef(false)
  const startRef = useRef<(() => Promise<void>) | null>(null)
  const logBottom = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    setLog(prev => [...prev.slice(-499), { time: ts(), msg, type }])
  }, [])

  useEffect(() => { logBottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  const stop = useCallback(() => { stopRef.current = true; setRunning(false); setPhase(''); addLog('Worker detenido por el usuario.', 'warn') }, [addLog])

  const consumeBatch = useCallback(async (jobId: string, missItems: MissItem[]): Promise<number> => {
    const submitRes = await fetch('/api/admin/worker/submit-mailsso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, action: 'submit', items: missItems }) })
    const submitData = await submitRes.json()
    if (!submitRes.ok || !submitData.data?.batchId) { addLog(`Error enviando batch: ${submitData.error ?? submitRes.status}`, 'error'); return 0 }
    const batchId = submitData.data.batchId
    addLog(`Batch enviado: ${missItems.length.toLocaleString('es-CL')} emails | id: ${batchId}`, 'ok')
    setInFlight(prev => prev + 1)
    let ready = false; let attempts = 0
    while (!stopRef.current && !ready && attempts < 60) {
      attempts++; await sleep(POLL_INTERVAL_MS); if (stopRef.current) break
      const pollRes = await fetch('/api/admin/worker/submit-mailsso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, action: 'poll', batchId }) })
      const pollData = await pollRes.json()
      if (!pollRes.ok) { addLog(`Error en poll #${attempts}: ${pollData.error ?? pollRes.status}`, 'error'); continue }
      if (pollData.data?.ready) { const written = pollData.data.written ?? 0; addLog(`Batch ${batchId.slice(0, 8)}... listo. ${written.toLocaleString('es-CL')} emails escritos.`, 'ok'); setMailssoHits(prev => prev + written); setInFlight(prev => Math.max(0, prev - 1)); ready = true; return written }
      else addLog(`Batch ${batchId.slice(0, 8)}... poll #${attempts}/60 — procesando.`, 'info')
    }
    if (!ready) addLog(`Batch ${batchId.slice(0, 8)}... abandonado tras ${attempts} intentos.`, 'warn')
    setInFlight(prev => Math.max(0, prev - 1)); return 0
  }, [addLog])

  const processJob = useCallback(async (job: Job) => {
    addLog(`── Iniciando job: ${job.list_name} (${job.id.slice(0, 8)}...)`)
    setActiveJob(job); setCacheHits(0); setMailssoHits(0); setQueueSize(0); setInFlight(0); setTotal(Number(job.total_count)); setStartedAt(Date.now())
    const missQueue: MissItem[] = []; const consumerPromises: Promise<number>[] = []; const jobStartedAt = Date.now()
    const FLUSH_INTERVAL_MS = 5 * 60 * 1000; let lastFlushAt = Date.now(); let producerDone = false
    setPhase('Productor: verificando en caché...')

    while (!stopRef.current && !producerDone) {
      const res = await fetch('/api/admin/worker/cache-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id, batchSize: CACHE_BATCH_SIZE }) })
      const data = await res.json()
      if (!res.ok) { addLog(`Error en cache-check: ${data.error ?? res.status}`, 'error'); break }
      const { done, cacheHits: hits, misses, remaining } = data.data ?? {}
      if (hits > 0) { setCacheHits(prev => { const next = prev + hits; const elapsed = (Date.now() - jobStartedAt) / 1000; if (elapsed > 0) setSpeed(Math.round(next / elapsed)); return next }); addLog(`Cache: +${hits} hits`, 'ok') }
      if (misses?.length > 0) { missQueue.push(...misses); setQueueSize(missQueue.length); addLog(`Cola misses: ${missQueue.length} emails`, 'info') }
      const timeSinceFlush = Date.now() - lastFlushAt; const shouldTimerFlush = timeSinceFlush >= FLUSH_INTERVAL_MS && missQueue.length > 0
      while ((missQueue.length >= MISS_QUEUE_LIMIT || shouldTimerFlush) && consumerPromises.length < MAX_CONSUMER_JOBS && missQueue.length > 0 && !stopRef.current) {
        const batch = missQueue.splice(0, MISS_QUEUE_LIMIT); setQueueSize(missQueue.length); addLog(`Consumidor: enviando ${batch.length} a mails.so...`, 'info'); consumerPromises.push(consumeBatch(job.id, batch)); lastFlushAt = Date.now()
      }
      if (done && !remaining) { producerDone = true; addLog(`Productor terminado. Cola restante: ${missQueue.length}.`, 'ok') }
      if (!done && !stopRef.current) await sleep(200)
    }

    while (missQueue.length > 0 && !stopRef.current) { const batch = missQueue.splice(0, MISS_QUEUE_LIMIT); setQueueSize(missQueue.length); consumerPromises.push(consumeBatch(job.id, batch)) }
    if (consumerPromises.length > 0) { setPhase('Esperando resultados de mails.so...'); addLog(`Esperando ${consumerPromises.length} batch(es)...`); await Promise.all(consumerPromises) }
    setPhase('Finalizando job...'); addLog('Finalizando y actualizando contadores...')
    const finalRes = await fetch('/api/admin/worker/write-chunk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id, offset: 0, limit: 5000 }) })
    const finalData = await finalRes.json()
    if (!finalRes.ok) addLog(`Error al finalizar: ${finalData.error ?? finalRes.status}`, 'error')
    else addLog(`Job "${job.list_name}" finalizado.`, 'ok')
    await mutate(); setActiveJob(null); setPhase('')
  }, [addLog, consumeBatch, mutate])

  const start = useCallback(async () => {
    const pendingJobs = jobs?.filter(j => j.status !== 'completed') ?? []
    if (pendingJobs.length === 0) { addLog('No hay jobs activos para procesar.', 'warn'); return }
    stopRef.current = false; setRunning(true); setLog([]); addLog(`Worker iniciado. ${pendingJobs.length} job(s) en cola.`)
    for (const job of pendingJobs) { if (stopRef.current) break; await processJob(job) }
    if (!stopRef.current) { addLog('Todos los jobs procesados.', 'ok'); setRunning(false); setPhase('') }
  }, [jobs, processJob, addLog])

  useEffect(() => { startRef.current = start }, [start])
  useEffect(() => {
    if (!autoStarted.current && !isLoading && jobs && !running && startRef.current) {
      const pending = jobs.filter(j => j.status !== 'completed')
      if (pending.length > 0) { autoStarted.current = true; startRef.current() }
    }
  }, [jobs, isLoading, running])

  const completed = cacheHits + mailssoHits
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const eta = speed > 0 && total > completed ? Math.round((total - completed) / speed) : null
  const pendingJobs = jobs?.filter(j => j.status !== 'completed') ?? []
  const completedJobs = jobs?.filter(j => j.status === 'completed') ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Worker de Verificación</h1><p className="text-muted-foreground text-sm mt-1">Pipeline productor/consumidor — caché en paralelo con mails.so.</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={running}><RefreshCw className="w-4 h-4 mr-1" />Actualizar</Button>
          {running && <Button variant="destructive" size="sm" onClick={stop}><Square className="w-4 h-4 mr-1" />Detener</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[{ label: 'Cache hits', value: cacheHits > 0 ? cacheHits.toLocaleString('es-CL') : running ? '…' : '—', icon: Database }, { label: 'Mails.so', value: mailssoHits > 0 ? mailssoHits.toLocaleString('es-CL') : running ? '…' : '—', icon: Send }, { label: 'Cola / En vuelo', value: running ? `${queueSize.toLocaleString('es-CL')} / ${inFlight}` : '—', icon: Zap }, { label: 'ETA', value: eta != null ? (eta > 60 ? `${Math.round(eta / 60)}m` : `${eta}s`) : '—', icon: CheckCircle2 }].map(s => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3"><s.icon className="w-5 h-5 text-muted-foreground" /><div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div></CardContent></Card>
        ))}
      </div>

      {activeJob && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="font-medium">{activeJob.list_name}</span><span className="text-sm text-muted-foreground">{phase}</span></div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground"><span>{completed.toLocaleString('es-CL')} / {total.toLocaleString('es-CL')} emails</span><span>{progress}%</span></div>
          </CardContent>
        </Card>
      )}

      {!running && pendingJobs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Jobs en cola ({pendingJobs.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-sm text-muted-foreground">Cargando...</p> : (
              <div className="space-y-2">
                {pendingJobs.map(job => {
                  const pct = Number(job.total_count) > 0 ? Math.round((Number(job.completed_count) / Number(job.total_count)) * 100) : 0
                  return (
                    <div key={job.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{job.list_name}</p><p className="text-xs text-muted-foreground">{Number(job.completed_count).toLocaleString('es-CL')} / {Number(job.total_count).toLocaleString('es-CL')} completados</p><Progress value={pct} className="h-1 mt-1" /></div>
                      <Badge variant="outline">{job.status}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {log.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Log en tiempo real</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="font-mono text-xs space-y-0.5 p-2">
                {log.map((entry, i) => (
                  <p key={i} className={entry.type === 'ok' ? 'text-green-600' : entry.type === 'error' ? 'text-destructive' : entry.type === 'warn' ? 'text-yellow-600' : 'text-muted-foreground'}>
                    <span className="text-muted-foreground">{entry.time}</span> {entry.msg}
                  </p>
                ))}
                <div ref={logBottom} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
