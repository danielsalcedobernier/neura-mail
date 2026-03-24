import sql from '@/lib/db'
import { Users, Mail, Send, Database, Server, CreditCard, Zap, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

async function getAdminStats() {
  const [users, lists, campaigns, cache, cronJobs, restrictions] = await Promise.all([
    sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE role = 'admin') as admins, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_this_week FROM users`,
    sql`SELECT COUNT(*) as count, SUM(total_count) as total_emails FROM email_lists`,
    sql`SELECT COUNT(*) as count, SUM(sent_count) as sent FROM campaigns`,
    sql`SELECT COUNT(*) as count FROM global_email_cache WHERE expires_at > NOW()`,
    sql`SELECT name, last_run_at, last_run_status, is_running, run_count FROM cron_jobs ORDER BY name`,
    sql`SELECT COUNT(*) as count FROM sending_restrictions WHERE is_active = true`,
  ])

  const recentUsers = await sql`
    SELECT id, email, full_name, role, created_at, is_active
    FROM users ORDER BY created_at DESC LIMIT 8
  `

  return {
    totalUsers: Number(users[0]?.total ?? 0),
    newUsersThisWeek: Number(users[0]?.new_this_week ?? 0),
    totalLists: Number(lists[0]?.count ?? 0),
    totalEmails: Number(lists[0]?.total_emails ?? 0),
    totalCampaigns: Number(campaigns[0]?.count ?? 0),
    totalSent: Number(campaigns[0]?.sent ?? 0),
    cacheEntries: Number(cache[0]?.count ?? 0),
    activeRestrictions: Number(restrictions[0]?.count ?? 0),
    cronJobs,
    recentUsers,
  }
}

export default async function AdminPage() {
  const stats = await getAdminStats()

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), sub: `+${stats.newUsersThisWeek} this week`, icon: Users, href: '/admin/users', color: 'text-primary' },
    { label: 'Email Lists', value: stats.totalLists.toLocaleString(), sub: `${stats.totalEmails.toLocaleString()} total emails`, icon: Mail, href: '/admin/campaigns', color: 'text-green-500' },
    { label: 'Campaigns', value: stats.totalCampaigns.toLocaleString(), sub: `${stats.totalSent.toLocaleString()} sent`, icon: Send, href: '/admin/campaigns', color: 'text-blue-500' },
    { label: 'Cache Entries', value: stats.cacheEntries.toLocaleString(), sub: 'Active verifications', icon: Database, href: '/admin/api-connections', color: 'text-purple-500' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Admin Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Platform-wide metrics and system status.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.href + s.label} href={s.href}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <Icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <p className="text-2xl font-semibold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cron Jobs Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Cron Jobs
            </CardTitle>
            <Link href="/admin/cron" className="text-xs text-primary hover:underline">Manage</Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {stats.cronJobs.map((job: Record<string, unknown>) => (
                <div key={job.name as string} className="flex items-center justify-between px-6 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-foreground">{(job.name as string).replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.last_run_at ? `Last run: ${new Date(job.last_run_at as string).toLocaleString()}` : 'Never run'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{Number(job.run_count)} runs</span>
                    <span className={`w-2 h-2 rounded-full ${
                      job.is_running ? 'bg-yellow-400 animate-pulse' :
                      job.last_run_status === 'success' ? 'bg-green-500' :
                      job.last_run_status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'
                    }`} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Recent Users
            </CardTitle>
            <Link href="/admin/users" className="text-xs text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {stats.recentUsers.map((u: Record<string, unknown>) => (
                <div key={u.id as string} className="flex items-center justify-between px-6 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-foreground">{u.full_name as string || u.email as string}</p>
                    <p className="text-xs text-muted-foreground">{u.email as string}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.role === 'admin' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">admin</span>
                    )}
                    <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
        {[
          { label: 'Manage Plans', href: '/admin/plans', icon: CreditCard },
          { label: 'Restrictions', href: '/admin/restrictions', icon: ShieldCheck },
          { label: 'API Keys', href: '/admin/api-connections', icon: Database },
          { label: 'Cron Jobs', href: '/admin/cron', icon: Zap },
          { label: 'Servers', href: '/admin/servers', icon: Server },
          { label: 'All Users', href: '/admin/users', icon: Users },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer text-center p-3">
                <Icon className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-foreground font-medium">{item.label}</p>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
