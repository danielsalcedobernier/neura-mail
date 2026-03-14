'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Mail, LayoutDashboard, CheckCircle, Send, Server, CreditCard,
  Settings, ChevronLeft, ChevronRight, LogOut, Users, Shield,
  BarChart3, Database, Zap, Bell, FileText, Key, Package,
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
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Email Lists', href: '/dashboard/lists', icon: FileText },
  { label: 'Verification', href: '/dashboard/verification', icon: CheckCircle },
  { label: 'Campaigns', href: '/dashboard/campaigns', icon: Send },
  { label: 'SMTP Servers', href: '/dashboard/smtp', icon: Server },
  { label: 'Credits', href: '/dashboard/credits', icon: CreditCard },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'API Access', href: '/dashboard/api', icon: Key },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
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
  { label: 'Campaigns', href: '/admin/campaigns', icon: Send },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Notifications', href: '/admin/notifications', icon: Bell },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

interface SidebarProps {
  role: 'admin' | 'client'
  userName?: string
  userEmail?: string
}

export default function Sidebar({ role, userName, userEmail }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const nav = role === 'admin' ? adminNav : clientNav

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    toast.success('Signed out')
    router.push('/login')
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-2.5 px-4 h-14 border-b border-sidebar-border shrink-0', collapsed && 'justify-center px-0')}>
        <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && <span className="font-semibold text-sm text-sidebar-foreground">NeuraMail</span>}
      </div>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-4 pt-4 pb-2">
          <span className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full',
            role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-sidebar-accent text-sidebar-accent-foreground'
          )}>
            {role === 'admin' ? 'Admin Panel' : 'Client Dashboard'}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 flex flex-col gap-0.5">
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
                  ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User info + collapse */}
      <div className="border-t border-sidebar-border p-2 flex flex-col gap-1 shrink-0">
        {!collapsed && (
          <div className="px-3 py-2">
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
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors w-full',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /><span className="text-xs">Collapse</span></>}
        </button>
      </div>
    </aside>
  )
}
