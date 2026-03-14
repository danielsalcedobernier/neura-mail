'use client'

import useSWR, { mutate } from 'swr'
import Link from 'next/link'
import { Plus, Send, Pause, Play, Trash2, BarChart2, Loader2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const statusColor: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-500/10 text-blue-600',
  running: 'bg-yellow-500/10 text-yellow-600',
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
  paused: 'bg-orange-500/10 text-orange-600',
  cancelled: 'bg-muted text-muted-foreground',
}

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useSWR('/api/campaigns', fetcher, { refreshInterval: 6000 })
  const [actionId, setActionId] = useState<string | null>(null)

  const doAction = async (id: string, action: 'pause' | 'resume' | 'cancel' | 'delete') => {
    setActionId(id)
    try {
      if (action === 'delete') {
        if (!confirm('Delete this campaign?')) return
        await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
        toast.success('Campaign deleted')
      } else {
        await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' })
        toast.success(`Campaign ${action}d`)
      }
      mutate('/api/campaigns')
    } catch { toast.error('Action failed') }
    finally { setActionId(null) }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build, schedule, and monitor email campaigns.</p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button><Plus className="w-4 h-4 mr-1.5" /> New Campaign</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : !campaigns?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Send className="w-10 h-10 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No campaigns yet</p>
            <Link href="/dashboard/campaigns/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Create your first campaign</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c: Record<string, unknown>) => {
            const openRate = Number(c.sent_count) > 0
              ? ((Number(c.opened_count) / Number(c.sent_count)) * 100).toFixed(1)
              : '0'
            const clickRate = Number(c.sent_count) > 0
              ? ((Number(c.clicked_count) / Number(c.sent_count)) * 100).toFixed(1)
              : '0'
            return (
              <Card key={c.id as string}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-foreground truncate">{c.name as string}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[c.status as string]}`}>
                          {c.status as string}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 truncate">{c.subject as string}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{Number(c.sent_count).toLocaleString()} sent</span>
                        <span className="text-blue-500">{openRate}% open</span>
                        <span className="text-green-500">{clickRate}% click</span>
                        <span>{Number(c.failed_count)} failed</span>
                        {c.scheduled_at && <span>Scheduled: {new Date(c.scheduled_at as string).toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Link href={`/dashboard/campaigns/${c.id}`}>
                        <Button size="sm" variant="outline"><Eye className="w-3.5 h-3.5" /></Button>
                      </Link>
                      {c.status === 'running' && (
                        <Button size="sm" variant="outline" disabled={actionId === c.id} onClick={() => doAction(c.id as string, 'pause')}>
                          <Pause className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {c.status === 'paused' && (
                        <Button size="sm" variant="outline" disabled={actionId === c.id} onClick={() => doAction(c.id as string, 'resume')}>
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {['draft', 'scheduled', 'paused'].includes(c.status as string) && (
                        <Button size="sm" variant="ghost" disabled={actionId === c.id} onClick={() => doAction(c.id as string, 'delete')}>
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
