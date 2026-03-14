import Link from 'next/link'
import { Zap } from 'lucide-react'
import type { Lang } from '@/i18n/translations'
import { t } from '@/i18n/translations'

export default function MarketingFooter({ lang }: { lang: Lang }) {
  const tr = t[lang].footer
  const base = lang === 'en' ? '/en' : ''

  const LINKS = {
    [tr.product]: [
      { label: tr.links.product[0], href: `${base}/features` },
      { label: tr.links.product[1], href: `${base}/pricing` },
      { label: tr.links.product[2], href: `${base}/docs` },
      { label: tr.links.product[3], href: '#' },
    ],
    [tr.company]: tr.links.company.map(label => ({ label, href: '#' })),
    [tr.legal]: tr.links.legal.map(label => ({ label, href: '#' })),
  }

  return (
    <footer className="bg-black border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1 flex flex-col gap-4">
            <Link href={`${base}/`} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-white text-[15px]">NeuraMail</span>
            </Link>
            <p className="text-sm text-white/40 leading-relaxed max-w-[200px]">{tr.tagline}</p>
          </div>

          {Object.entries(LINKS).map(([section, links]) => (
            <div key={section} className="flex flex-col gap-4">
              <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">{section}</p>
              <ul className="flex flex-col gap-2.5">
                {links.map(l => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-white/50 hover:text-white transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} NeuraMail. {tr.rights}
          </p>
          <p className="text-xs text-white/20">{tr.trusted}</p>
        </div>
      </div>
    </footer>
  )
}
