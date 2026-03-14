import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return forbidden() }
  const { id } = await params

  const rows = await sql`SELECT service_name, credentials FROM api_connections WHERE id = ${id}`
  if (!rows[0]) return error('Not found', 404)

  const { service_name, credentials } = rows[0] as { service_name: string; credentials: Record<string, string> }
  let status: 'success' | 'error' = 'error'
  let message = 'Unknown service'

  try {
    if (service_name === 'resend') {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${credentials.api_key}` },
      })
      status = res.ok ? 'success' : 'error'
      message = res.ok ? 'Resend API key is valid' : 'Invalid Resend API key'
    } else if (service_name === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${credentials.api_key}` },
      })
      status = res.ok ? 'success' : 'error'
      message = res.ok ? 'OpenAI API key is valid' : 'Invalid OpenAI API key'
    } else {
      status = 'success'
      message = 'No automated test available for this service'
    }
  } catch (e) {
    status = 'error'
    message = e instanceof Error ? e.message : 'Connection error'
  }

  await sql`
    UPDATE api_connections SET last_test_status = ${status}, last_tested_at = NOW() WHERE id = ${id}
  `

  if (status === 'success') return ok({ message })
  return error(message, 400)
}
