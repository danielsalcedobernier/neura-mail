'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Play, Pause, RotateCcw, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const CHUNK_SIZE = 5000
const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

type Job = {
  id: string
  list_id: string
  list_name: string
  status: string
  total_count: number
  processed_count: number
}

type WorkerState = 'idle' | 'running' | 'paused' | 'done' | 'error'

export default function PropagatePage() {
  const { data: jobs } = useSWR<Job[]>('/api/admin/verification-jobs?status=completed', fetcher, { refreshInterval: 0 })

  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [workerState, setWorkerState]     = useState<WorkerState>('idle')
  const [offset, setOffset]               = useState(0)
  const [totalUpdated, setTotalUpdated]   = useState(0)
  const [chunksDone, setChunksDone]       = useState(0)
  const [speed, setSpeed]                 = useState(0)       // rows/sec
  const [log, setLog]                     = useState<string[]>([])
  const [startTime, setStartTime]         = useState<number | null>(null)
  const [lastChunkTime, setLastChunkTime] = useState<number | null>(null)

  const runningRef = useRef(false)
  const logEndRef  = useRef<HTMLDivElement>(null)

  const selectedJob = jobs?.find(j => j.id === selectedJobId)

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('es-CL')
    setLog(prev => [...prev.slice(-199), `[${ts}] ${msg}`])
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const reset = () => {
    runningRef.current = false
    setWorkerState('idle')
    setOffset(0)
    setTotalUpdated(0)
    setChunksDone(0)
    setSpeed(0)
    setLog([])
    setStartTime(null)
    setLastChunkTime(null)
  }

  const runChunk = useCallback(async (jobId: string, currentOffset: number, currentTotal: number): Promise<void> => {
    if (!runningRef.current) return

    const chunkStart = Date.now()
    try {
      const res  = await fetch(`/api/admin/propagate-chunk?jobId=${jobId}&offset=${currentOffset}&limit=${CHUNK_SIZE}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      const { rowsUpdated, done } = data.data as { rowsUpdated: number; done: boolean }
      const elapsed = (Date.now() - chunkStart) / 1000
      const rowsPerSec = Math.round(rowsUpdated / Math.max(elapsed, 0.1))

      setSpeed(rowsPerSec)
      setLastChunkTime(Date.now())
      setTotalUpdated(prev => { const next = prev + rowsUpdated; return next })
      setChunksDone(prev => prev + 1)
      setOffset(currentOffset + CHUNK_SIZE)

      const newTotal = currentTotal + rowsUpdated
      addLog(`Chunk ${Math.floor(currentOffset / CHUNK_SIZE) + 1}: ${rowsUpdated.toLocaleString('es-CL')} filas actualizadas (${rowsPerSec.toLocaleString('es-CL')} filas/s)`)

      if (done) {
        runningRef.current = false
        setWorkerState('done')
        addLog(`Completado. Total: ${newTotal.toLocaleString('es-CL')} contactos actualizados. Contadores de lista sincronizados.`)
        toast.success(`Propagacion completa: ${newTotal.toLocaleString('es-CL')} contactos`)
        return
      }

      // Continue with next chunk
      await runChunk(jobId, currentOffset + CHUNK_SIZE, newTotal)
    } catch (err: unknown) {
      runningRef.current = false
      setWorkerState('error')
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`)
      toast.error('Error en el worker')
    }
  }, [addLog])

  const start = () => {
    if (!selectedJobId) { toast.error('Selecciona un job primero'); return }
    runningRef.current = true
    setWorkerState('running')
    const now = Date.now()
    setStartTime(now)
    addLog(`Iniciando worker para job ${selectedJobId.slice(0, 8)}... (chunks de ${CHUNK_SIZE.toLocaleString('es-CL')} filas)`)
    runChunk(selectedJobId, offset, totalUpdated)
  }

  const pause = () => {
    runningRef.current = false
    setWorkerState('paused')
    addLog(`Pausado en offset ${offset.toLocaleString('es-CL')}. Puedes reanudar desde aqui.`)
  }

  const resume = () => {
    if (!selectedJobId) return
    runningRef.current = true
    setWorkerState('running')
    addLog(`Reanudando desde offset ${offset.toLocaleString('es-CL')}...`)
    runChunk(selectedJobId, offset, totalUpdated)
  }

  const elapsedSec = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
  const totalJobRows = selectedJob?.total_count ?? 0
  const progressPct = totalJobRows > 0 ? Math.min(100, Math.round((totalUpdated / totalJobRows) * 100)) : 0
  const etaSeconds = speed > 0 && totalJobRows > 0
    ? Math.round((totalJobRows - totalUpdated - offset) / speed)
    : null

  const stateColor: Record<WorkerState, string> = {
    idle:    'secondary',
    running: 'default',
    paused:  'outline',
    done:    'default',
    error:   'destructive',
  }
  const stateLabel: Record<WorkerState, string> = {
    idle:    'Inactivo',
    running: 'Ejecutando',
    paused:  'Pausado',
    done:    'Completado',
    error:   'Error',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propagador de verificaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Propaga los resultados de verification_job_items a email_list_contacts en chunks de {CHUNK_SIZE.toLocaleString('es-CL')} filas.
            El trabajo lo hace el navegador — sin timeouts de servidor.
          </p>
        </div>
        <Badge variant={stateColor[workerState] as 'default' | 'secondary' | 'destructive' | 'outline'}>
          {stateLabel[workerState]}
        </Badge>
      </div>

      {/* Job selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seleccionar job</CardTitle>
          <CardDescription>Solo se muestran jobs con estado "completado".</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedJobId} onValueChange={v => { setSelectedJobId(v); reset() }} disabled={workerState === 'running'}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Selecciona un job de verificación..." />
            </SelectTrigger>
            <SelectContent>
              {(jobs ?? []).map(j => (
                <SelectItem key={j.id} value={j.id}>
                  {j.list_name} — {Number(j.total_count).toLocaleString('es-CL')} contactos
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Stats */}
      {selectedJobId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Actualizados</p>
              <p className="text-2xl font-bold">{totalUpdated.toLocaleString('es-CL')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Chunks</p>
              <p className="text-2xl font-bold">{chunksDone}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Velocidad</p>
              <p className="text-2xl font-bold">{speed > 0 ? `${speed.toLocaleString('es-CL')}/s` : '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Tiempo restante</p>
              <p className="text-2xl font-bold">
                {etaSeconds !== null
                  ? etaSeconds > 60
                    ? `${Math.round(etaSeconds / 60)}m`
                    : `${etaSeconds}s`
                  : '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress */}
      {selectedJobId && (
        <Card>
          <CardContent className="pt-4 pb-4 flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progreso</span>
              <span className="font-medium">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-3" />
            <p className="text-xs text-muted-foreground">
              {totalUpdated.toLocaleString('es-CL')} / {totalJobRows.toLocaleString('es-CL')} filas
              {elapsedSec > 0 && ` · ${elapsedSec}s transcurridos`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {workerState === 'idle' && (
          <Button onClick={start} disabled={!selectedJobId}>
            <Play className="w-4 h-4 mr-1.5" /> Iniciar
          </Button>
        )}
        {workerState === 'running' && (
          <Button variant="outline" onClick={pause}>
            <Pause className="w-4 h-4 mr-1.5" /> Pausar
          </Button>
        )}
        {workerState === 'paused' && (
          <>
            <Button onClick={resume}>
              <Play className="w-4 h-4 mr-1.5" /> Reanudar
            </Button>
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="w-4 h-4 mr-1.5" /> Reiniciar
            </Button>
          </>
        )}
        {(workerState === 'done' || workerState === 'error') && (
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-1.5" /> Reiniciar
          </Button>
        )}
        {workerState === 'done' && (
          <div className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="w-4 h-4" /> Propagacion completa
          </div>
        )}
        {workerState === 'error' && (
          <div className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" /> Error — puedes reanudar o reiniciar
          </div>
        )}
        {workerState === 'paused' && offset > 0 && (
          <p className="text-xs text-muted-foreground">Reanudara desde offset {offset.toLocaleString('es-CL')}</p>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" /> Log del worker
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-md p-3 h-64 overflow-y-auto font-mono text-xs flex flex-col gap-0.5">
              {log.map((line, i) => (
                <span key={i} className="text-foreground/80">{line}</span>
              ))}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
