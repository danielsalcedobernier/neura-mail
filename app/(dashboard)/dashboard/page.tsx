import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { BarChart3, CheckCircle, Send, CreditCard, ArrowRight } from 'lucide-react'
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
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Bienvenido, {session.full_name?.split(' ')[0] || 'usuario'}
        </h1>
        <p className="text-muted-foreground mt-1">Aquí está el resumen de tu cuenta.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.label} href={s.href}>
              <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <Icon className={`h-5 w-5 mb-3 ${s.color}`} />
                  <div className="text-2xl font-bold text-foreground">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <CheckCircle className="h-6 w-6 text-blue-500" />
            <div>
              <div className="font-semibold text-sm">Verificar lista de emails</div>
              <div className="text-xs text-muted-foreground mt-1">Verifica la validez de los emails antes de enviar campañas.</div>
            </div>
            <Button size="sm" variant="outline" asChild className="w-full">
              <Link href="/dashboard/verification">Iniciar verificación <ArrowRight className="ml-2 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <Send className="h-6 w-6 text-purple-500" />
            <div>
              <div className="font-semibold text-sm">Nueva campaña</div>
              <div className="text-xs text-muted-foreground mt-1">Crea una campaña de email y prográmala o envíala ahora.</div>
            </div>
            <Button size="sm" variant="outline" asChild className="w-full">
              <Link href="/dashboard/campaigns/new">Crear campaña <ArrowRight className="ml-2 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <CreditCard className="h-6 w-6 text-primary" />
            <div>
              <div className="font-semibold text-sm">Comprar créditos</div>
              <div className="text-xs text-muted-foreground mt-1">Recarga créditos para seguir verificando tus listas.</div>
            </div>
            <Button size="sm" variant="outline" asChild className="w-full">
              <Link href="/dashboard/credits">Ver planes <ArrowRight className="ml-2 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Campañas recientes</CardTitle>
          <Link href="/dashboard/campaigns" className="text-xs text-primary hover:underline">Ver todas</Link>
        </CardHeader>
        <CardContent>
          {stats.recentCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Aún no hay campañas. <Link href="/dashboard/campaigns/new" className="text-primary hover:underline">Crea tu primera</Link>.
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentCampaigns.map((c: Record<string, unknown>) => (
                <div key={c.id as string} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <div className="text-sm font-medium text-foreground">{c.name as string}</div>
                    <div className="text-xs text-muted-foreground">
                      {Number(c.sent_count ?? 0).toLocaleString('es-CL')} enviados · {Number(c.opened_count ?? 0).toLocaleString('es-CL')} abiertos
                    </div>
                  </div>
                  <Badge className={statusColors[c.status as string] || 'bg-muted text-muted-foreground'}>
                    {statusLabels[c.status as string] || c.status as string}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
