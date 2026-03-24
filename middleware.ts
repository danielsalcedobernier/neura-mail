import { NextRequest, NextResponse } from 'next/server'
import { SPANISH_COUNTRIES } from '@/i18n/translations'

// Rutas de marketing
const MARKETING_PATHS = ['/', '/features', '/pricing', '/docs']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 1. PROTECCIÓN DE ADMIN (Simplificada para el VPS)
  if (pathname.startsWith('/admin')) {
    // En el VPS, vamos a dejar que las páginas de admin manejen su propia seguridad 
    // en el servidor (Node.js) para evitar el error de 'crypto' aquí en el Edge.
    return NextResponse.next()
  }

  // 2. FILTRO DE MARKETING
  const isMarketing = MARKETING_PATHS.some(
    p => pathname === p || pathname === `/en${p}` || pathname === `/es${p}`
  )
  if (!isMarketing) return NextResponse.next()

  // 3. SI YA TIENE IDIOMA, SEGUIR
  if (pathname.startsWith('/en/') || pathname === '/en' ||
      pathname.startsWith('/es/') || pathname === '/es') {
    return NextResponse.next()
  }

  // 4. DETECCIÓN DE PAÍS (Ajustada para VPS)
  // Como no hay 'x-vercel-ip-country', por defecto servimos español (tu preferencia)
  // a menos que el navegador diga explícitamente inglés.
  const acceptLang = req.headers.get('accept-language') || ''
  const wantsEnglish = acceptLang.startsWith('en')

  if (!wantsEnglish) {
    return NextResponse.next() // Sirve español por defecto
  }

  // Redirigir a inglés si el navegador es inglés
  const url = req.nextUrl.clone()
  url.pathname = `/en${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/', '/features', '/pricing', '/docs', '/admin/:path*'],
}