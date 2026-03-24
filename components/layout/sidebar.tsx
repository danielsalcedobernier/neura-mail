'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Mail, LayoutDashboard, CheckCircle, Send, Server, CreditCard,
  Settings, ChevronLeft, ChevronRight, LogOut, Users, Shield,
  BarChart3, Database, Zap, Bell, FileText, Key, Package, Code2, Activity, Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
}

const clientNav: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Listas de email', href: '/dashboard/lists', icon: FileText },
  { label: 'Verificación', href: '/dashboard/verification', icon: CheckCircle },
  { label: 'Campañas', href: '/dashboard/campaigns', icon: Send },
  { label: 'Servidores SMTP', href: '/dashboard/smtp', icon: Server },
  { label: 'Créditos', href: '/dashboard/credits', icon: CreditCard },
  { label: 'Analíticas', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'NeuraMail API', href: '/dashboard/developer', icon: Code2 },
  { label: 'Acceso API', href: '/dashboard/api', icon: Key },
  { label: 'Configuración', href: '/dashboard/settings', icon: Settings },
]

const adminNav: NavItem[] = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Plans', href: '/admin/plans', icon: CreditCard },
  { label: 'Credit Packs', href: '/admin/credit-packs', icon: Package },
  { label: 'Restrictions', href: '/admin/restrictions', icon: Shield },
  { label: 'Dedicated Servers', href: '/admin/servers', icon: Server },
  { label: 'API Connections', href: '/admin/api-connections', icon: Database },
  { label: 'Cron Jobs', href: '/admin/cron', icon: Zap },
  { label: 'Divisor de BBDD', href: '/admin/db-splitter', icon: Database },
  { label: 'Importar Caché', href: '/admin/cache-import', icon: Database },
  { label: 'Batch → Caché', href: '/admin/cache-batch', icon: Database },
  { label: 'Exportar Caché', href: '/admin/cache-export', icon: Download },
  { label: 'Listas', href: '/admin/lists', icon: FileText },
  { label: 'Propagador', href: '/admin/propagate', icon: Zap },
  { label: 'Worker Verif.', href: '/admin/worker', icon: Activity },
  { label: 'Campaigns', href: '/admin/campaigns', icon: Send },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Notifications', href: '/admin/notifications', icon: Bell },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

const workerNav: NavItem[] = [
  { label: 'Worker Verif.', href: '/admin/worker', icon: Activity },
]

interface SidebarProps {
  role: 'admin' | 'client' | 'worker'
  userName?: string
  userEmail?: string
}

export default function Sidebar({ role, userName, userEmail }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const nav = role === 'admin' ? adminNav : role === 'worker' ? workerNav : clientNav

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    toast.success('Signed out')
    router.push('/login')
  }

  return (
    <aside className={cn(
      'flex h-screen flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-sidebar-border', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Mail className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && <span className="font-bold text-sidebar-foreground text-sm">NeuraMail</span>}
      </div>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-4 py-2 border-b border-sidebar-border">
          <span className="text-xs text-sidebar-foreground/50 font-medium uppercase tracking-wider">
            {role === 'admin' ? 'Panel Admin' : role === 'worker' ? 'Worker' : 'Mi cuenta'}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {nav.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== '/dashboard' && item.href !== '/admin' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User info + collapse */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-0.5">
        {!collapsed && (
          <div className="px-3 py-1.5">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{userName || 'User'}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{userEmail}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors w-full',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors w-full',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Contraer</span></>}
        </button>
      </div>
    </aside>
  )
}
