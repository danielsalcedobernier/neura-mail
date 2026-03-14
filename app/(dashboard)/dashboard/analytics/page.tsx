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

  // Build chart data from campaigns list
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Performance overview across all campaigns and verifications</p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {overviewCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label}>
              <CardContent className="pt-5 pb-4">
                <Icon className={`w-4 h-4 ${card.color} mb-2`} />
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign performance bar chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Campaign Performance (last 10)</CardTitle>
            </CardHeader>
            <CardContent>
              {campaignChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No campaign data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={campaignChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="sent" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Sent" />
                    <Bar dataKey="opened" fill="#22c55e" radius={[2, 2, 0, 0]} name="Opened" />
                    <Bar dataKey="clicked" fill="#8b5cf6" radius={[2, 2, 0, 0]} name="Clicked" />
                    <Bar dataKey="bounced" fill="#ef4444" radius={[2, 2, 0, 0]} name="Bounced" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Verification pie chart */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Verification Results</CardTitle>
            </CardHeader>
            <CardContent>
              {verificationPieData.every(d => d.value === 0) ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No verifications yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={verificationPieData} cx="50%" cy="45%" outerRadius={80} dataKey="value">
                      {verificationPieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Open rate trend */}
      {campaigns && campaigns.length > 1 && (
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open Rate Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={campaignChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                <Line type="monotone" dataKey="opened" stroke="#3b82f6" strokeWidth={2} dot={false} name="Opened" />
                <Line type="monotone" dataKey="clicked" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Clicked" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
