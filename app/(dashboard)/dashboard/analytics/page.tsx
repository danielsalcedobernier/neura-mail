'use client'

import useSWR from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, Send, CheckCircle, XCircle, Mail, MousePointerClick } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

export default function AnalyticsPage() {
  const { data: stats } = useSWR('/api/analytics/overview', fetcher)
  const { data: campaigns } = useSWR('/api/campaigns', fetcher)

  const overviewCards = [
    { label: 'Total Sent', value: stats?.total_sent?.toLocaleString() ?? '—', icon: Send, color: 'text-primary' },
    { label: 'Delivered', value: stats?.total_delivered?.toLocaleString() ?? '—', icon: Mail, color: 'text-green-500' },
    { label: 'Opens', value: stats?.total_opens?.toLocaleString() ?? '—', icon: TrendingUp, color: 'text-blue-400' },
    { label: 'Clicks', value: stats?.total_clicks?.toLocaleString() ?? '—', icon: MousePointerClick, color: 'text-purple-500' },
    { label: 'Bounced', value: stats?.total_bounced?.toLocaleString() ?? '—', icon: XCircle, color: 'text-red-500' },
    { label: 'Verified Emails', value: stats?.verified_emails?.toLocaleString() ?? '—', icon: CheckCircle, color: 'text-emerald-500' },
  ]

  const campaignChartData = (campaigns || []).slice(0, 10).map((c: Record<string, unknown>) => ({
    name: (c.name as string)?.substring(0, 14) || 'Campaign',
    sent: c.sent_count,
    opened: c.opened_count,
    clicked: c.clicked_count,
    bounced: c.bounced_count,
  }))

  const verificationPieData = [
    { name: 'Valid', value: stats?.valid_count || 0 },
    { name: 'Invalid', value: stats?.invalid_count || 0 },
    { name: 'Risky', value: stats?.risky_count || 0 },
    { name: 'Unknown', value: stats?.unknown_count || 0 },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Performance overview across all campaigns and verifications</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {overviewCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label}>
              <CardContent className="pt-5 pb-4">
                <Icon className={`h-5 w-5 mb-2 ${card.color}`} />
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Campaign Performance (last 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No campaign data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={campaignChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="sent" fill={COLORS[0]} />
                  <Bar dataKey="opened" fill={COLORS[1]} />
                  <Bar dataKey="clicked" fill={COLORS[4]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Verification Results</CardTitle>
          </CardHeader>
          <CardContent>
            {verificationPieData.every(d => d.value === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No verifications yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={verificationPieData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label>
                    {verificationPieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {campaigns && campaigns.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Open Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={campaigns.slice(0, 20).map((c: Record<string, unknown>) => ({
                name: (c.name as string)?.substring(0, 12),
                rate: c.sent_count ? Math.round((Number(c.opened_count) / Number(c.sent_count)) * 100) : 0,
              }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`, 'Open Rate']} />
                <Line type="monotone" dataKey="rate" stroke={COLORS[0]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
