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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Platform Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">System-wide statistics and trends</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {topCards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label}>
              <CardContent className="pt-5 pb-4">
                <Icon className={`w-4 h-4 ${c.color} mb-2`} />
                <p className="text-2xl font-bold text-foreground">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">User Growth</CardTitle>
            </CardHeader>
            <CardContent>
              {userGrowthData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={userGrowthData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                    <Line type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={2} dot={false} name="Users" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Verification Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {verificationPie.every(d => d.value === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={verificationPie} cx="50%" cy="45%" outerRadius={75} dataKey="value">
                    {verificationPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No revenue data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[2, 2, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
