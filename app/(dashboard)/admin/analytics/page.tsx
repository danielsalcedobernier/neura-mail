'use client'

import useSWR from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Users, Mail, CheckCircle, CreditCard, TrendingUp, Database } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

export default function AdminAnalyticsPage() {
  const { data: stats } = useSWR('/api/admin/analytics', fetcher)

  const topCards = [
    { label: 'Total Users', value: stats?.total_users?.toLocaleString() ?? '—', icon: Users, color: 'text-primary' },
    { label: 'Total Emails Sent', value: stats?.total_sent?.toLocaleString() ?? '—', icon: Mail, color: 'text-blue-500' },
    { label: 'Emails Verified', value: stats?.total_verified?.toLocaleString() ?? '—', icon: CheckCircle, color: 'text-green-500' },
    { label: 'Total Revenue', value: stats?.total_revenue ? `$${Number(stats.total_revenue).toFixed(2)}` : '—', icon: CreditCard, color: 'text-yellow-500' },
    { label: 'Verif. Valid', value: stats?.valid_count?.toLocaleString() ?? '—', icon: TrendingUp, color: 'text-green-500' },
    { label: 'Cache Hits', value: stats?.cache_hits?.toLocaleString() ?? '—', icon: Database, color: 'text-cyan-500' },
  ]

  const verificationPie = [
    { name: 'Valid', value: stats?.valid_count || 0 },
    { name: 'Invalid', value: stats?.invalid_count || 0 },
    { name: 'Risky', value: stats?.risky_count || 0 },
    { name: 'Unknown', value: stats?.unknown_count || 0 },
  ]

  const userGrowthData = stats?.user_growth || []
  const revenueData = stats?.revenue_by_month || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">System-wide statistics and trends</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {topCards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label}>
              <CardContent className="pt-5 pb-4">
                <Icon className={`h-5 w-5 mb-2 ${c.color}`} />
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">User Growth</CardTitle>
          </CardHeader>
          <CardContent>
            {userGrowthData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={userGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Verification Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {verificationPie.every(d => d.value === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={verificationPie} cx="50%" cy="50%" outerRadius={75} dataKey="value" label>
                    {verificationPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No revenue data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill={COLORS[0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
