'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { CheckCircle, XCircle, AlertCircle, HelpCircle, Play, Pause, Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const statusIcon = {
  valid:    <CheckCircle className="w-4 h-4 text-green-500" />,
  invalid:  <XCircle className="w-4 h-4 text-destructive" />,
  risky:    <AlertCircle className="w-4 h-4 text-yellow-500" />,
  unknown:  <HelpCircle className="w-4 h-4 text-muted-foreground" />,
  catch_all: <AlertCircle className="w-4 h-4 text-blue-400" />,
}

const jobStatusColor: Record<string, string> = {
  queued:          'bg-muted text-muted-foreground',
  seeding:         'bg-blue-500/10 text-blue-600',
  cache_sweeping:  'bg-purple-500/10 text-purple-600',
  running:         'bg-yellow-500/10 text-yellow-600',
  completed:       'bg-green-500/10 text-green-600',
  failed:          'bg-destructive/10 text-destructive',
  paused:          'bg-orange-500/10 text-orange-600',
  cancelled:       'bg-muted text-muted-foreground',
}

const jobStatusLabel: Record<string, string> = {
  queued:         'En cola',
  seeding:        'Preparando',
  cache_sweeping: 'Revisando caché',
  running:        'Procesando',
  completed:      'Completado',
  failed:         'Fallido',
  paused:         'Pausado',
  cancelled:      'Cancelado',
}

function JobList({ jobs, onMutate }: { jobs: Record<string, unknown>[]; onMutate: () => void }) {
  async function pauseJob(id: string) {
    await fetch(`/api/verification/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }) })
    onMutate()
  }
  async function resumeJob(id: string) {
    await fetch(`/api/verification/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resume' }) })
    onMutate()
  }
  async function cancelJob(id: string) {
    await fetch(`/api/verification/${id}`, { method: 'DELETE' })
    onMutate()
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => {
        const id        = job.id as string
        const total     = Number(job.total_emails)
        const processed = Number(job.processed_emails)
        const pct       = total > 0 ? Math.round((processed / total) * 100) : 0
        const isActive  = ['seeding', 'cache_sweeping', 'queued', 'running', 'paused', 'failed'].includes(job.status as string)

        return (
          <Card key={id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-foreground">{job.name as string || 'Verification Job'}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${jobStatusColor[job.status as string] ?? 'bg-muted text-muted-foreground'}`}>
                {jobStatusLabel[job.status as string] ?? job.status}
              </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {processed.toLocaleString('es-CL')} / {total.toLocaleString('es-CL')} procesados · {Number(job.credits_used ?? 0).toLocaleString()} créditos usados
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0 items-center">
                  {['seeding', 'cache_sweeping', 'queued', 'running'].includes(job.status as string) && (
                    <Button size="sm" variant="outline" onClick={() => pauseJob(id)} title="Pausar">
                      <Pause className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {(job.status === 'paused' || job.status === 'failed') && (
                    <Button size="sm" variant="outline" onClick={() => resumeJob(id)} title="Reanudar">
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => cancelJob(id)} title="Cancelar y reembolsar créditos">
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {(job.status === 'running' || job.status === 'paused') && (
                <Progress value={pct} className="h-1.5 mb-3" />
              )}

              <div className="grid grid-cols-5 gap-2">
                {(['valid', 'invalid', 'risky', 'catch_all', 'unknown'] as const).map(k => (
                  <div key={k} className="flex flex-col items-center bg-muted/50 rounded-md py-2 px-1">
                    {statusIcon[k]}
                    <span className="text-xs font-medium text-foreground mt-1">{Number(job[`${k}_count`] ?? 0).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">{{ valid: 'Válido', invalid: 'Inválido', risky: 'Riesgoso', catch_all: 'Catch-All', unknown: 'Desconocido' }[k]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default function VerificationPage() {
  const { data: jobs, isLoading: jobsLoading } = useSWR('/api/verification', fetcher, { refreshInterval: 4000 })
  const { data: lists } = useSWR('/api/lists', fetcher)
  const { data: credits } = useSWR('/api/credits', fetcher)
  const [selectedList, setSelectedList] = useState('')
  const [starting, setStarting] = useState(false)

  const startJob = async () => {
    if (!selectedList) { toast.error('Select a list to verify'); return }
    setStarting(true)
    try {
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: selectedList }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to start'); return }
      toast.success('Verification job queued!')
      mutate('/api/verification')
      setSelectedList('')
    } catch { toast.error('Failed to start verification') }
    finally { setStarting(false) }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Verificación de emails</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Verifica la validez de los emails en tus listas.</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{Number(credits?.balance ?? 0).toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">créditos</span>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Iniciar verificación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label>Seleccionar lista</Label>
              <Select value={selectedList} onValueChange={setSelectedList}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige una lista..." />
                </SelectTrigger>
                <SelectContent>
                  {lists?.map((l: Record<string, unknown>) => (
                    <SelectItem key={l.id as string} value={l.id as string}>
                      {l.name as string} — {Number(l.unverified_count).toLocaleString('es-CL')} sin verificar
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={startJob} disabled={starting || !selectedList} className="shrink-0">
              {starting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
              Iniciar verificación
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Cada email verificado consume 1 crédito.</p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Trabajos de verificación</h2>
        {jobsLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : !jobs?.length ? (
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Aún no hay trabajos de verificación.</p>
            </CardContent>
          </Card>
        ) : (
          <JobList jobs={jobs} onMutate={() => mutate('/api/verification')} />
        )}
      </div>
    </div>
  )
}
