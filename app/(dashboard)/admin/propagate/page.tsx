'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Play, Pause, RotateCcw, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CHUNK_SIZE = 5000
const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

type Job = { id: string; list_id: string; list_name: string; status: string; total_count: number; processed_count: number }
type WorkerState = 'idle' | 'running' | 'paused' | 'done' | 'error'

export default function PropagatePage() {
  const { data: jobs } = useSWR<Job[]>('/api/admin/verification-jobs?status=completed', fetcher)
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [workerState, setWorkerState] = useState<WorkerState>('idle')
  const [offset, setOffset] = useState(0)
  const [totalUpdated, setTotalUpdated] = useState(0)
  const [chunksDone, setChunksDone] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const runningRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const selectedJob = jobs?.find(j => j.id === selectedJobId)
  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('es-CL')
    setLog(prev => [...prev.slice(-199), `[${ts}] ${msg}`])
  }, [])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  const reset = () => { runningRef.current = false; setWorkerState('idle'); setOffset(0); setTotalUpdated(0); setChunksDone(0); setSpeed(0); setLog([]) }

  const runChunk = useCallback(async (jobId: string, currentOffset: number, currentTotal: number): Promise<void> => {
    if (!runningRef.current) return
    const chunkStart = Date.now()
    try {
      const res = await fetch(`/api/admin/propagate-chunk?jobId=${jobId}&offset=${currentOffset}&limit=${CHUNK_SIZE}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const { rowsUpdated, done } = data.data as { rowsUpdated: number; done: boolean }
      const elapsed = (Date.now() - chunkStart) / 1000
      setSpeed(Math.round(rowsUpdated / Math.max(elapsed, 0.1)))
      setChunksDone(prev => prev + 1)
      setOffset(currentOffset + CHUNK_SIZE)
      const newTotal = currentTotal + rowsUpdated
      setTotalUpdated(newTotal)
      addLog(`Chunk ${Math.floor(currentOffset / CHUNK_SIZE) + 1}: ${rowsUpdated.toLocaleString('es-CL')} filas`)
      if (done) { runningRef.current = false; setWorkerState('done'); addLog(`Completado. Total: ${newTotal.toLocaleString('es-CL')} contactos.`); toast.success(`Propagacion completa: ${newTotal.toLocaleString('es-CL')} contactos`); return }
      await runChunk(jobId, currentOffset + CHUNK_SIZE, newTotal)
    } catch (err: unknown) { runningRef.current = false; setWorkerState('error'); addLog(`Error: ${err instanceof Error ? err.message : String(err)}`); toast.error('Error en el worker') }
  }, [addLog])

  const start = () => {
    if (!selectedJobId) { toast.error('Selecciona un job primero'); return }
    runningRef.current = true; setWorkerState('running')
    addLog(`Iniciando worker para job ${selectedJobId.slice(0, 8)}...`)
    runChunk(selectedJobId, offset, totalUpdated)
  }
  const pause = () => { runningRef.current = false; setWorkerState('paused'); addLog(`Pausado en offset ${offset.toLocaleString('es-CL')}.`) }
  const resume = () => { if (!selectedJobId) return; runningRef.current = true; setWorkerState('running'); addLog('Reanudando...'); runChunk(selectedJobId, offset, totalUpdated) }

  const totalJobRows = selectedJob?.total_count ?? 0
  const progressPct = totalJobRows > 0 ? Math.min(100, Math.round((totalUpdated / totalJobRows) * 100)) : 0

  const stateLabel: Record<WorkerState, string> = { idle: 'Inactivo', running: 'Ejecutando', paused: 'Pausado', done: 'Completado', error: 'Error' }
  const stateVariant: Record<WorkerState, 'secondary' | 'default' | 'outline' | 'destructive'> = { idle: 'secondary', running: 'default', paused: 'outline', done: 'default', error: 'destructive' }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Propagador de verificaciones</h1><p className="text-muted-foreground text-sm mt-1">Propaga resultados de verification_job_items a email_list_contacts en chunks de {CHUNK_SIZE.toLocaleString('es-CL')} filas.</p></div>
        <Badge variant={stateVariant[workerState]}>{stateLabel[workerState]}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>Seleccionar job</CardTitle><CardDescription>Solo se muestran jobs con estado "completado".</CardDescription></CardHeader>
        <CardContent>
          <Select value={selectedJobId} onValueChange={v => { setSelectedJobId(v); reset() }} disabled={workerState === 'running'}>
            <SelectTrigger><SelectValue placeholder="Selecciona un job..." /></SelectTrigger>
            <SelectContent>{(jobs ?? []).map(j => <SelectItem key={j.id} value={j.id}>{j.list_name} — {Number(j.total_count).toLocaleString('es-CL')} contactos</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedJobId && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[{ label: 'Actualizados', value: totalUpdated.toLocaleString('es-CL') }, { label: 'Chunks', value: String(chunksDone) }, { label: 'Velocidad', value: speed > 0 ? `${speed.toLocaleString('es-CL')}/s` : '—' }, { label: 'Progreso', value: `${progressPct}%` }].map(s => (
            <Card key={s.label}><CardContent className="p-4"><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></CardContent></Card>
          ))}
        </div>
      )}

      {selectedJobId && <Progress value={progressPct} className="h-2" />}

      <div className="flex gap-3 flex-wrap">
        {workerState === 'idle' && <Button onClick={start}><Play className="w-4 h-4 mr-2" />Iniciar</Button>}
        {workerState === 'running' && <Button variant="outline" onClick={pause}><Pause className="w-4 h-4 mr-2" />Pausar</Button>}
        {workerState === 'paused' && <><Button onClick={resume}><Play className="w-4 h-4 mr-2" />Reanudar</Button><Button variant="outline" onClick={reset}><RotateCcw className="w-4 h-4 mr-2" />Reiniciar</Button></>}
        {(workerState === 'done' || workerState === 'error') && <Button variant="outline" onClick={reset}><RotateCcw className="w-4 h-4 mr-2" />Reiniciar</Button>}
        {workerState === 'done' && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" />Propagacion completa</span>}
        {workerState === 'error' && <span className="flex items-center gap-1 text-sm text-destructive"><AlertCircle className="w-4 h-4" />Error — puedes reanudar o reiniciar</span>}
      </div>

      {log.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Log del worker</CardTitle></CardHeader>
          <CardContent>
            <div className="bg-muted/40 rounded p-3 h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {log.map((line, i) => <p key={i}>{line}</p>)}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
