'use client'

import useSWR, { mutate } from 'swr'
import Link from 'next/link'
import { Plus, Send, Pause, Play, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campañas</h1>
          <p className="text-muted-foreground text-sm mt-1">Crea, programa y monitorea campañas de email.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/campaigns/new"><Plus className="h-4 w-4 mr-2" />Nueva campaña</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !campaigns?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Send className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <div className="text-sm font-medium mb-2">Aún no hay campañas</div>
            <Button asChild size="sm">
              <Link href="/dashboard/campaigns/new">Crear tu primera campaña</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c: Record<string, unknown>) => {
            const openRate = Number(c.sent_count) > 0
              ? ((Number(c.opened_count) / Number(c.sent_count)) * 100).toFixed(1)
              : '0'
            const clickRate = Number(c.sent_count) > 0
              ? ((Number(c.clicked_count) / Number(c.sent_count)) * 100).toFixed(1)
              : '0'
            return (
              <Card key={c.id as string}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{c.name as string}</span>
                        <Badge className={statusColor[c.status as string] || 'bg-muted text-muted-foreground'}>
                          {c.status as string}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">{c.subject as string}</div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span>{Number(c.sent_count).toLocaleString('es-CL')} enviados</span>
                        <span>{openRate}% abiertos</span>
                        <span>{clickRate}% clics</span>
                        <span>{Number(c.failed_count)} fallidos</span>
                        {c.scheduled_at && <span>Programada: {new Date(c.scheduled_at as string).toLocaleString('es-CL')}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.status === 'running' && (
                        <Button size="sm" variant="outline" onClick={() => doAction(c.id as string, 'pause')} disabled={actionId === c.id}>
                          <Pause className="h-3 w-3" />
                        </Button>
                      )}
                      {c.status === 'paused' && (
                        <Button size="sm" variant="outline" onClick={() => doAction(c.id as string, 'resume')} disabled={actionId === c.id}>
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      {['draft', 'scheduled', 'paused'].includes(c.status as string) && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => doAction(c.id as string, 'delete')} disabled={actionId === c.id}>
                          <Trash2 className="h-3 w-3" />
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
