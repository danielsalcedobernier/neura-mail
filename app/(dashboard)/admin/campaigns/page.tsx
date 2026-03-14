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

function StatBadge({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <Icon className="w-3 h-3" />{value.toLocaleString()}
    </span>
  )
}

export default function AdminCampaignsPage() {
  const { data: campaigns, isLoading } = useSWR('/api/admin/campaigns', fetcher)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
        <p className="text-sm text-muted-foreground mt-0.5">All campaigns across all users on the platform.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Campaign', 'User', 'Status', 'Recipients', 'Stats', 'Created'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(campaigns ?? []).map((c: Record<string, unknown>) => (
                  <tr key={c.id as string} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 max-w-xs">
                      <p className="font-medium text-foreground truncate">{c.name as string}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.subject as string}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-xs text-foreground">{c.user_email as string}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[c.status as string] ?? 'bg-muted text-muted-foreground'}`}>
                        {c.status as string}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {Number(c.total_recipients ?? 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <StatBadge icon={Send} value={Number(c.sent_count ?? 0)} label="Sent" />
                        <StatBadge icon={Eye} value={Number(c.opened_count ?? 0)} label="Opens" />
                        <StatBadge icon={MousePointerClick} value={Number(c.clicked_count ?? 0)} label="Clicks" />
                        <StatBadge icon={XCircle} value={Number(c.bounced_count ?? 0)} label="Bounces" />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {new Date(c.created_at as string).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(campaigns ?? []).length && (
              <div className="py-12 text-center">
                <Send className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
