import { NextRequest, NextResponse } from 'next/server'
import { SPANISH_COUNTRIES } from '@/i18n/translations'
import { getSessionFromRequest } from '@/lib/auth'

// Marketing routes that support i18n
const MARKETING_PATHS = ['/', '/features', '/pricing', '/docs']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Workers can only access /admin/worker — redirect all other /admin/* routes
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/worker')) {
    const session = await getSessionFromRequest(req)
    if (session?.role === 'worker') {
      return NextResponse.redirect(new URL('/admin/worker', req.url))
    }
  }

  // Skip non-marketing routes
  const isMarketing = MARKETING_PATHS.some(
    p => pathname === p || pathname === `/en${p}` || pathname === `/es${p}`
  )
  if (!isMarketing) return NextResponse.next()

  // If already prefixed with a lang, respect it
  if (pathname.startsWith('/en/') || pathname === '/en' ||
      pathname.startsWith('/es/') || pathname === '/es') {
    return NextResponse.next()
  }

  // Detect country from Vercel geo header
  const country = req.headers.get('x-vercel-ip-country') ?? ''
  const wantsSpanish = !country || SPANISH_COUNTRIES.has(country.toUpperCase())

  // Spanish-speaking countries OR unknown → serve default (no prefix)
  if (wantsSpanish) return NextResponse.next()

  // English-speaking countries → redirect to /en/...
  const url = req.nextUrl.clone()
  url.pathname = `/en${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/', '/features', '/pricing', '/docs', '/admin/:path*'],
}
