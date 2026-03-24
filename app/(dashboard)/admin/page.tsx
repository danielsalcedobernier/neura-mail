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
    { label: 'Email Lists', value: stats.totalLists.toLocaleString(), sub: `${stats.totalEmails.toLocaleString()} total emails`, icon: Mail, href: '/admin/lists', color: 'text-green-500' },
    { label: 'Campaigns', value: stats.totalCampaigns.toLocaleString(), sub: `${stats.totalSent.toLocaleString()} sent`, icon: Send, href: '/admin/campaigns', color: 'text-blue-500' },
    { label: 'Cache Entries', value: stats.cacheEntries.toLocaleString(), sub: 'Active verifications', icon: Database, href: '/admin/api-connections', color: 'text-purple-500' },
  ]

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform-wide metrics and system status.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.label} href={s.href}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <Icon className={`h-5 w-5 mb-3 ${s.color}`} />
                  <div className="text-2xl font-bold text-foreground">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  <div className="text-xs text-primary mt-1">{s.sub}</div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Cron Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Cron Jobs</CardTitle>
            <Link href="/admin/cron" className="text-xs text-primary hover:underline">Manage</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.cronJobs.map((job: Record<string, unknown>) => (
                <div key={job.name as string} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div>
                    <div className="text-xs font-medium">{(job.name as string).replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted-foreground">
                      {job.last_run_at ? `Last run: ${new Date(job.last_run_at as string).toLocaleString()}` : 'Never run'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{Number(job.run_count)} runs</span>
                    <Badge className={job.is_running ? 'bg-yellow-500/10 text-yellow-600' : job.last_run_status === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}>
                      {job.is_running ? 'running' : job.last_run_status as string || 'idle'}
                    </Badge>
                  </div>
                </div>
              ))}
              {stats.cronJobs.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">No cron jobs found</div>}
            </div>
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Recent Users</CardTitle>
            <Link href="/admin/users" className="text-xs text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentUsers.map((u: Record<string, unknown>) => (
                <div key={u.id as string} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{u.full_name as string || u.email as string}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email as string}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {u.role === 'admin' && <Badge className="bg-primary/10 text-primary text-xs">admin</Badge>}
                    <Badge className={u.is_active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'} >
                      {u.is_active ? 'active' : 'inactive'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Manage Plans', href: '/admin/plans', icon: CreditCard },
          { label: 'Restrictions', href: '/admin/restrictions', icon: ShieldCheck },
          { label: 'API Connections', href: '/admin/api-connections', icon: Database },
          { label: 'Cron Jobs', href: '/admin/cron', icon: Zap },
          { label: 'Servers', href: '/admin/servers', icon: Server },
          { label: 'All Users', href: '/admin/users', icon: Users },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="pt-4 pb-4 flex flex-col items-center gap-2 text-center">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium">{item.label}</span>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
