'use client'

import useSWR from 'swr'
import { Send, Loader2, Users, CheckCircle, XCircle, MousePointerClick, Eye } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? [])

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-yellow-500/10 text-yellow-600',
  sending: 'bg-blue-500/10 text-blue-600',
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-red-500/10 text-red-600',
  paused: 'bg-orange-500/10 text-orange-600',
}

export default function AdminCampaignsPage() {
  const { data: campaigns, isLoading } = useSWR('/api/admin/campaigns', fetcher)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground text-sm mt-1">All campaigns across all users on the platform.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {['Campaign', 'User', 'Status', 'Recipients', 'Stats', 'Created'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(campaigns ?? []).map((c: Record<string, unknown>) => (
                  <tr key={c.id as string} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.name as string}</p>
                      <p className="text-xs text-muted-foreground">{c.subject as string}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.user_email as string}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[c.status as string] || STATUS_STYLES.draft}`}>
                        {c.status as string}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3" />
                        {Number(c.total_recipients ?? 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{Number(c.opened_count ?? 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" />{Number(c.clicked_count ?? 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1 text-destructive"><XCircle className="h-3 w-3" />{Number(c.bounced_count ?? 0).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(c.created_at as string).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(campaigns ?? []).length && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
