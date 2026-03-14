import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { BarChart3, CheckCircle, Send, CreditCard, TrendingUp, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

async function getDashboardStats(userId: string) {
  const [credits, lists, campaigns, verifications] = await Promise.all([
    sql`SELECT balance FROM user_credits WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as count, SUM(valid_count) as valid FROM email_lists WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as count, SUM(sent_count) as sent FROM campaigns WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as count FROM verification_jobs WHERE user_id = ${userId} AND status = 'completed'`,
  ])

  const recentCampaigns = await sql`
    SELECT id, name, status, sent_count, opened_count, created_at
    FROM campaigns WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 5
  `

  return {
    credits: credits[0]?.balance ?? 0,
    totalLists: Number(lists[0]?.count ?? 0),
    totalValidEmails: Number(lists[0]?.valid ?? 0),
    totalCampaigns: Number(campaigns[0]?.count ?? 0),
    totalSent: Number(campaigns[0]?.sent ?? 0),
    completedVerifications: Number(verifications[0]?.count ?? 0),
    recentCampaigns,
  }
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-primary/10 text-primary',
  running: 'bg-yellow-500/10 text-yellow-600',
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
  paused: 'bg-orange-500/10 text-orange-600',
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) return null
  const stats = await getDashboardStats(session.id)

  const statCards = [
    { label: 'Créditos disponibles', value: stats.credits.toLocaleString('es-CL'), icon: CreditCard, href: '/dashboard/credits', color: 'text-primary' },
    { label: 'Listas de email', value: stats.totalLists.toString(), icon: BarChart3, href: '/dashboard/lists', color: 'text-green-500' },
    { label: 'Emails verificados', value: stats.totalValidEmails.toLocaleString('es-CL'), icon: CheckCircle, href: '/dashboard/verification', color: 'text-blue-500' },
    { label: 'Emails enviados', value: stats.totalSent.toLocaleString('es-CL'), icon: Send, href: '/dashboard/campaigns', color: 'text-purple-500' },
  ]

  const statusLabels: Record<string, string> = {
    draft: 'borrador', scheduled: 'programada', running: 'enviando',
    completed: 'completada', failed: 'fallida', paused: 'pausada',
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Bienvenido, {session.full_name?.split(' ')[0] || 'usuario'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Aquí está el resumen de tu cuenta.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.href} href={s.href}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <Icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <p className="text-2xl font-semibold text-foreground">{s.value}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-5 flex flex-col gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            <h3 className="font-medium text-foreground text-sm">Verificar lista de emails</h3>
            <p className="text-xs text-muted-foreground">Sube un CSV y verifica emails usando caché global y la API de mails.so.</p>
            <Link href="/dashboard/verification">
              <Button size="sm" variant="outline" className="mt-1 w-full">
                Iniciar verificación <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="border-dashed border-green-500/30 bg-green-500/5">
          <CardContent className="p-5 flex flex-col gap-2">
            <Send className="w-5 h-5 text-green-600" />
            <h3 className="font-medium text-foreground text-sm">Nueva campaña</h3>
            <p className="text-xs text-muted-foreground">Crea una campaña de email con IA o manualmente, y prográmala o envíala ahora.</p>
            <Link href="/dashboard/campaigns/new">
              <Button size="sm" variant="outline" className="mt-1 w-full">
                Crear campaña <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="border-dashed border-purple-500/30 bg-purple-500/5">
          <CardContent className="p-5 flex flex-col gap-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <h3 className="font-medium text-foreground text-sm">Comprar créditos</h3>
            <p className="text-xs text-muted-foreground">Recarga créditos para seguir verificando tus listas de email.</p>
            <Link href="/dashboard/credits">
              <Button size="sm" variant="outline" className="mt-1 w-full">
                Ver planes <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-medium">Campañas recientes</CardTitle>
          <Link href="/dashboard/campaigns" className="text-xs text-primary hover:underline flex items-center gap-1">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recentCampaigns.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Send className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">Aún no hay campañas. Crea tu primera.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {stats.recentCampaigns.map((c: Record<string, unknown>) => (
                <div key={c.id as string} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name as string}</p>
                    <p className="text-xs text-muted-foreground">{Number(c.sent_count ?? 0).toLocaleString('es-CL')} enviados · {Number(c.opened_count ?? 0).toLocaleString('es-CL')} abiertos</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[c.status as string] || 'bg-muted text-muted-foreground'}`}>
                    {statusLabels[c.status as string] || c.status as string}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
