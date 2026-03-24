import { NextRequest } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import sql from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ok, error } from '@/lib/api'
import dns from 'dns/promises'

const schema = z.object({ domain: z.string().min(3) })

export async function GET() {
  const session = await getSession()
  if (!session) return error('Unauthorized', 401)
  const rows = await sql`
    SELECT id, domain, status, spf_record, dkim_selector, dkim_public_key,
      dns_txt_value, created_at, verified_at
    FROM sending_domains WHERE user_id = ${session.id} ORDER BY created_at DESC
  `
  return ok(rows)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return error('Unauthorized', 401)
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return error('Invalid domain', 422)
  const { domain } = parsed.data
  const dnsTxtValue = `neuramail-verify=${randomBytes(16).toString('hex')}`
  const spfRecord = `v=spf1 include:amazonses.com ~all`
  const dkimSelector = `neuramail${Date.now().toString(36)}`
  const rows = await sql`
    INSERT INTO sending_domains (user_id, domain, dkim_selector, dns_txt_value, spf_record)
    VALUES (${session.id}, ${domain}, ${dkimSelector}, ${dnsTxtValue}, ${spfRecord})
    ON CONFLICT (user_id, domain) DO UPDATE SET updated_at = NOW()
    RETURNING id, domain, status, dns_txt_value, spf_record, dkim_selector, created_at
  `
  return ok(rows[0], 201)
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return error('Unauthorized', 401)
  const { domain_id } = await request.json()
  const domainRows = await sql`SELECT * FROM sending_domains WHERE id = ${domain_id} AND user_id = ${session.id}`
  if (!domainRows[0]) return error('Domain not found', 404)
  const d = domainRows[0]
  try {
    const txtRecords = await dns.resolveTxt(d.domain as string)
    const flat = txtRecords.flat()
    const verified = flat.some((r: string) => r.includes(d.dns_txt_value as string))
    if (verified) {
      await sql`UPDATE sending_domains SET status = 'verified', verified_at = NOW(), updated_at = NOW() WHERE id = ${domain_id}`
      return ok({ verified: true })
    } else {
      return ok({ verified: false, message: 'TXT record not found. DNS propagation may take up to 48h.' })
    }
  } catch {
    return ok({ verified: false, message: 'DNS lookup failed. Check the record and try again.' })
  }
}
