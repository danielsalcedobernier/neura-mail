'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Menu, X, Zap, Globe } from 'lucide-react'
import type { Lang } from '@/i18n/translations'
import { t } from '@/i18n/translations'

export default function MarketingNavbar({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const tr = t[lang].nav

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Build link with lang prefix for 'en', no prefix for 'es'
  const href = (path: string) => lang === 'en' ? `/en${path}` : path

  // Build alternate lang link for the current page
  const alternateLang = lang === 'es' ? 'en' : 'es'
  const alternateHref = (() => {
    if (lang === 'en') {
      // strip /en prefix
      return pathname.replace(/^\/en/, '') || '/'
    }
    return `/en${pathname === '/' ? '' : pathname}`
  })()

  const NAV_LINKS = [
    { label: tr.features, href: href('/features') },
    { label: tr.pricing, href: href('/pricing') },
    { label: tr.docs, href: href('/docs') },
  ]

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-black/90 backdrop-blur-md border-b border-white/10' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href={href('/')} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white text-[15px] tracking-tight">NeuraMail</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {/* Language switcher */}
          <Link
            href={alternateHref}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {alternateLang === 'en' ? 'English' : 'Español'}
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10">
              {tr.login}
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="bg-white text-black hover:bg-white/90 font-medium">
              {tr.cta}
            </Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-white/70 hover:text-white"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-black border-b border-white/10 px-6 py-4 flex flex-col gap-4">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-sm text-white/70 hover:text-white transition-colors" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link href={alternateHref} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70" onClick={() => setOpen(false)}>
            <Globe className="w-3.5 h-3.5" />
            {alternateLang === 'en' ? 'English' : 'Español'}
          </Link>
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <Link href="/login" onClick={() => setOpen(false)}>
              <Button variant="outline" size="sm" className="w-full border-white/20 text-white hover:bg-white/10">{tr.login}</Button>
            </Link>
            <Link href="/register" onClick={() => setOpen(false)}>
              <Button size="sm" className="w-full bg-white text-black hover:bg-white/90">{tr.cta}</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
