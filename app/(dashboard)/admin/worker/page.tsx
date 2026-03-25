'use client'

import useSWR from 'swr'
import { CheckCircle2, Clock, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

type Job = {
  id: string
  list_name: string
  status: string
  total_count: number
  completed_count: number
  pending_count: number
  processing_count: number
}

const STATUS_LABELS: Record<string, string> = {
  seeding: 'Sembrando',
  cache_sweeping: 'Barrido de caché',
  queued: 'En cola',
  running: 'Procesando',
  completed: 'Completado',
  failed: 'Fallido',
  paused: 'Pausado',
}

const STATUS_COLORS: Record<string, string> = {
  seeding: 'bg-blue-500/10 text-blue-600',
  cache_sweeping: 'bg-purple-500/10 text-purple-600',
  queued: 'bg-yellow-500/10 text-yellow-600',
  running: 'bg-primary/10 text-primary',
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
  paused: 'bg-muted text-muted-foreground',
}

export default function WorkerPage() {
  const { data: jobs, isLoading, mutate } = useSWR<Job[]>(
    '/api/admin/worker/jobs',
    fetcher,
    { refreshInterval: 8000 }
  )

  const pendingJobs   = jobs?.filter(j => j.status !== 'completed' && j.status !== 'failed') ?? []
  const completedJobs = jobs?.filter(j => j.status === 'completed') ?? []
  const failedJobs    = jobs?.filter(j => j.status === 'failed') ?? []

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Verificación de emails</h1>
          <p className="text-sm text-muted-foreground mt-1">
            El procesamiento corre en el servidor via cron. Esta vista muestra el estado en tiempo real.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Actualizar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Active / queued jobs */}
          {pendingJobs.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Jobs activos ({pendingJobs.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {pendingJobs.map(job => {
                    const total = Number(job.total_count) || 0
                    const done  = Number(job.completed_count) || 0
                    const pct   = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
                    return (
                      <div key={job.id} className="py-4 space-y-2 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {(job.status === 'running' || job.status === 'cache_sweeping' || job.status === 'seeding') && (
                              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-primary" />
                            )}
                            {job.status === 'queued' && (
                              <Clock className="w-4 h-4 shrink-0 text-yellow-500" />
                            )}
                            <p className="font-medium text-sm truncate">{job.list_name}</p>
                          </div>
                          <Badge className={`shrink-0 text-xs border-0 ${STATUS_COLORS[job.status] ?? 'bg-muted text-muted-foreground'}`}>
                            {STATUS_LABELS[job.status] ?? job.status}
                          </Badge>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{done.toLocaleString('es-CL')} / {total.toLocaleString('es-CL')} emails</span>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground text-sm">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
                No hay jobs activos en este momento.
              </CardContent>
            </Card>
          )}

          {/* Failed jobs */}
          {failedJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Jobs fallidos ({failedJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {failedJobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium">{job.list_name}</p>
                      <Badge className="text-xs border-0 bg-destructive/10 text-destructive">Fallido</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Completed jobs */}
          {completedJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Completados recientemente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {completedJobs.slice(0, 8).map(job => (
                    <div key={job.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium">{job.list_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {Number(job.total_count).toLocaleString('es-CL')} emails
                        </p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
