'use client'

import useSWR, { mutate } from 'swr'
import { Zap, Play, RefreshCw, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const CRON_DESCRIPTIONS: Record<string, string> = {
  process_verification_queue: 'Picks up queued verification jobs and processes emails via cache/API',
  process_sending_queue: 'Sends individual emails for running campaigns (throttled by SMTP limits)',
  maintenance: 'Removes expired sessions, cache entries, and stale locks',
}

const CRON_ENDPOINTS: Record<string, string> = {
  process_verification_queue: '/api/cron/verify',
  process_sending_queue: '/api/cron/send',
  maintenance: '/api/cron/maintenance',
}

export default function CronPage() {
  const { data: jobs, isLoading } = useSWR('/api/admin/cron', fetcher, { refreshInterval: 5000 })
  const [running, setRunning] = useState<string | null>(null)

  const triggerJob = async (name: string) => {
    setRunning(name)
    const endpoint = CRON_ENDPOINTS[name]
    if (!endpoint) { toast.error('No endpoint for this job'); setRunning(null); return }
    try {
      const res = await fetch(endpoint)
      const json = await res.json()
      if (res.ok) toast.success(`Triggered: ${JSON.stringify(json.data).substring(0, 100)}`)
      else toast.error(json.error || 'Trigger failed')
      mutate('/api/admin/cron')
    } catch { toast.error('Trigger failed') }
    finally { setRunning(null) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Cron Jobs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Scheduled background jobs. All run automatically via Vercel Cron.</p>
      </div>

      <Card className="mb-4 bg-muted/30">
        <CardContent className="p-4 text-xs text-muted-foreground">
          <p>Configure Vercel Cron in <code className="font-mono bg-muted px-1 rounded">vercel.json</code> to call <code className="font-mono bg-muted px-1 rounded">/api/cron/[job-name]</code> endpoints. You can also trigger jobs manually below for testing.</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          {(jobs || []).map((job: Record<string, unknown>) => (
            <Card key={job.id as string}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    job.is_running ? 'bg-yellow-500/10' :
                    job.last_run_status === 'success' ? 'bg-green-500/10' :
                    job.last_run_status === 'error' ? 'bg-destructive/10' : 'bg-muted'
                  }`}>
                    {job.is_running ? <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" /> :
                     job.last_run_status === 'success' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                     job.last_run_status === 'error' ? <XCircle className="w-5 h-5 text-destructive" /> :
                     <Clock className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-mono text-sm font-medium text-foreground">{job.name as string}</p>
                      {job.is_running && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 animate-pulse">running</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {CRON_DESCRIPTIONS[job.name as string] || 'Background processing job'}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Runs: {Number(job.run_count)} times</span>
                      {job.last_run_at && <span>Last: {new Date(job.last_run_at as string).toLocaleString()}</span>}
                      {job.last_run_duration_ms && <span>{Number(job.last_run_duration_ms)}ms</span>}
                      <code className="bg-muted px-1 rounded">{CRON_ENDPOINTS[job.name as string] || 'no endpoint'}</code>
                    </div>
                    {job.last_error && (
                      <p className="text-xs text-destructive mt-1 font-mono">Error: {job.last_error as string}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerJob(job.name as string)}
                    disabled={running === job.name as string || job.is_running as boolean}
                    className="shrink-0"
                  >
                    {running === job.name as string ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span className="ml-1.5 text-xs">Run</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
