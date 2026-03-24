'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { CheckCircle, XCircle, AlertCircle, HelpCircle, Play, Pause, Loader2, Zap, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const statusIcon: Record<string, React.ReactNode> = {
  valid: <CheckCircle className="h-4 w-4 text-green-500" />,
  invalid: <XCircle className="h-4 w-4 text-destructive" />,
  risky: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  unknown: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
  catch_all: <AlertCircle className="h-4 w-4 text-orange-500" />,
}

const jobStatusColor: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  seeding: 'bg-blue-500/10 text-blue-600',
  cache_sweeping: 'bg-muted text-muted-foreground',
  running: 'bg-yellow-500/10 text-yellow-600',
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
  paused: 'bg-orange-500/10 text-orange-600',
  cancelled: 'bg-muted text-muted-foreground',
}

const jobStatusLabel: Record<string, string> = {
  queued: 'En cola', seeding: 'Preparando', cache_sweeping: 'En cola',
  running: 'Procesando', completed: 'Completado', failed: 'Fallido',
  paused: 'Pausado', cancelled: 'Cancelado',
}

function JobList({ jobs, onMutate }: { jobs: Record<string, unknown>[]; onMutate: () => void }) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function pauseJob(id: string) {
    setLoadingId(`pause-${id}`)
    try {
      const res = await fetch(`/api/verification/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al pausar'); return }
      toast.success('Job pausado'); onMutate()
    } catch { toast.error('Error al pausar') }
    finally { setLoadingId(null) }
  }

  async function resumeJob(id: string) {
    setLoadingId(`resume-${id}`)
    try {
      const res = await fetch(`/api/verification/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resume' }) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al reanudar'); return }
      toast.success('Job reanudado'); onMutate()
    } catch { toast.error('Error al reanudar') }
    finally { setLoadingId(null) }
  }

  async function cancelJob(id: string) {
    setLoadingId(`cancel-${id}`)
    try {
      const res = await fetch(`/api/verification/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al cancelar'); return }
      toast.success(`Job cancelado · ${json.data?.creditsRefunded ?? 0} créditos reembolsados`)
      onMutate()
    } catch { toast.error('Error al cancelar') }
    finally { setLoadingId(null) }
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const id = job.id as string
        const total = Number(job.total_emails)
        const processed = Number(job.processed_emails)
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0
        const isActive = ['seeding', 'cache_sweeping', 'queued', 'running', 'paused', 'failed'].includes(job.status as string)
        return (
          <Card key={id}>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{job.name as string || 'Verification Job'}</span>
                    <Badge className={jobStatusColor[job.status as string] || 'bg-muted text-muted-foreground'}>
                      {jobStatusLabel[job.status as string] ?? job.status as string}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {processed.toLocaleString('es-CL')} / {total.toLocaleString('es-CL')} procesados · {Number(job.credits_used ?? 0).toLocaleString()} créditos usados
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {['seeding', 'cache_sweeping', 'queued', 'running'].includes(job.status as string) && (
                    <Button size="sm" variant="outline" onClick={() => pauseJob(id)} title="Pausar" disabled={!!loadingId}>
                      {loadingId === `pause-${id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                    </Button>
                  )}
                  {(job.status === 'paused' || job.status === 'failed') && (
                    <Button size="sm" variant="outline" onClick={() => resumeJob(id)} title="Reanudar" disabled={!!loadingId}>
                      {loadingId === `resume-${id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => cancelJob(id)} title="Cancelar y reembolsar créditos" disabled={!!loadingId}>
                      {loadingId === `cancel-${id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>

              {(job.status === 'running' || job.status === 'paused') && (
                <Progress value={pct} className="h-1.5" />
              )}

              <div className="flex items-center gap-4 flex-wrap">
                {(['valid', 'invalid', 'risky', 'catch_all', 'unknown'] as const).map(k => (
                  <div key={k} className="flex items-center gap-1.5">
                    {statusIcon[k]}
                    <span className="text-xs font-medium">{Number((job as Record<string, unknown>)[`${k}_count`] ?? 0).toLocaleString()}</span>
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Verificación de emails</h1>
          <p className="text-muted-foreground text-sm mt-1">Verifica la validez de los emails en tus listas.</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="text-foreground">{Number(credits?.balance ?? 0).toLocaleString()}</span>
          <span className="text-muted-foreground">créditos</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Iniciar verificación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Seleccionar lista</Label>
            <Select value={selectedList} onValueChange={setSelectedList}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una lista de email..." />
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
          <Button onClick={startJob} disabled={starting || !selectedList} className="w-full sm:w-auto">
            {starting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            Iniciar verificación
          </Button>
          <p className="text-xs text-muted-foreground">Cada email verificado consume 1 crédito.</p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-base font-semibold mb-3 text-foreground">Trabajos de verificación</h2>
        {jobsLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !jobs?.length ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aún no hay trabajos de verificación.
            </CardContent>
          </Card>
        ) : (
          <JobList jobs={jobs} onMutate={() => mutate('/api/verification')} />
        )}
      </div>
    </div>
  )
}
