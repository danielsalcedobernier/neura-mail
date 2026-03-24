'use client'

import useSWR, { mutate } from 'swr'
import { Zap, Play, RefreshCw, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const CRON_DESCRIPTIONS: Record<string, string> = {
  verify_seed: 'Populates verification_job_items from email_list_contacts for queued jobs',
  verify_sweep: 'Checks verification_job_items against global_email_cache (10k/tick)',
  verify_process: 'Sends batches to mails.so and writes results back to DB',
  process_sending_queue: 'Sends individual emails for running campaigns (throttled by SMTP limits)',
  maintenance: 'Removes expired sessions, cache entries, and stale locks',
  sync_verification_progress: 'Updates processed/valid/invalid counters on running verification jobs',
}

const CRON_ENDPOINTS: Record<string, string> = {
  verify_seed: '/api/cron/verify-seed',
  verify_sweep: '/api/cron/verify-sweep',
  verify_process: '/api/cron/verify-process',
  process_sending_queue: '/api/cron/send',
  maintenance: '/api/cron/maintenance',
  sync_verification_progress: '/api/cron/sync_verification_progress',
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
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Zap className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Cron Jobs</h1>
          <p className="text-muted-foreground text-sm">Scheduled background jobs. Trigger manually for testing.</p>
        </div>
      </div>

      <div className="p-4 border rounded-lg bg-muted/30 text-sm text-muted-foreground">
        Configure Vercel Cron in vercel.json to call <code className="font-mono text-xs bg-muted px-1 rounded">/api/cron/[job-name]</code> endpoints automatically.
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {(jobs || []).map((job: Record<string, unknown>) => (
            <Card key={job.name as string}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="shrink-0">
                  {job.is_running ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> :
                    job.last_run_status === 'success' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                    job.last_run_status === 'error' ? <XCircle className="w-5 h-5 text-destructive" /> :
                    <Clock className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{job.name as string}</span>
                    {job.is_running && <span className="text-xs text-primary border border-primary/30 rounded px-1.5 py-0.5">running</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{CRON_DESCRIPTIONS[job.name as string] || 'Background processing job'}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Runs: {Number(job.run_count)} times</span>
                    {job.last_run_at && <span>Last: {new Date(job.last_run_at as string).toLocaleString()}</span>}
                    {job.last_run_duration_ms && <span>{Number(job.last_run_duration_ms)}ms</span>}
                    <code className="font-mono bg-muted px-1 rounded text-xs">{CRON_ENDPOINTS[job.name as string] || 'no endpoint'}</code>
                  </div>
                  {job.last_error && <p className="text-xs text-destructive mt-1">Error: {job.last_error as string}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => triggerJob(job.name as string)} disabled={running === job.name as string || job.is_running as boolean}>
                  {running === job.name as string ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}Run
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
