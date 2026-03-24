import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { ok, unauthorized, error, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (session.role !== 'admin') return unauthorized()
  try {
    const body = await req.json()
    const { rows } = body as {
      rows: {
        email: string
        verification_status: string
        verification_score?: number
        mx_found?: boolean
        smtp_valid?: boolean
        is_disposable?: boolean
        is_role_based?: boolean
        is_catch_all?: boolean
        provider?: string
      }[]
    }
    if (!Array.isArray(rows) || rows.length === 0) return error('rows[] required', 400)
    if (rows.length > 5000) return error('Max 5,000 rows per request', 400)

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const seen = new Set<string>()
    const dedupedRows = rows.filter(r => {
      const key = (r.email ?? '').toLowerCase().trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    const payload = JSON.stringify(dedupedRows.map(r => ({
      email: (r.email ?? '').toLowerCase().trim(),
      verification_status: r.verification_status ?? 'unknown',
      verification_score: r.verification_score ?? 0,
      mx_found: r.mx_found ?? false,
      smtp_valid: r.smtp_valid ?? false,
      is_disposable: r.is_disposable ?? false,
      is_role_based: r.is_role_based ?? false,
      is_catch_all: r.is_catch_all ?? false,
      provider: r.provider ?? null,
      verified_by_user_id: session.id,
      expires_at: expiresAt,
    })))

    await sql`
      INSERT INTO global_email_cache (
        email, verification_status, verification_score,
        mx_found, smtp_valid, is_disposable, is_role_based, is_catch_all,
        provider, raw_response, verified_by_user_id, expires_at
      )
      SELECT
        v.email, v.verification_status, (v.verification_score)::numeric,
        (v.mx_found)::boolean, (v.smtp_valid)::boolean, (v.is_disposable)::boolean,
        (v.is_role_based)::boolean, (v.is_catch_all)::boolean,
        v.provider, '{}'::jsonb, v.verified_by_user_id::uuid, (v.expires_at)::timestamptz
      FROM json_to_recordset(${payload}::json) AS v(
        email text, verification_status text, verification_score numeric,
        mx_found boolean, smtp_valid boolean, is_disposable boolean,
        is_role_based boolean, is_catch_all boolean,
        provider text, verified_by_user_id text, expires_at text
      )
      ON CONFLICT (email) DO UPDATE SET
        verification_status = EXCLUDED.verification_status,
        verification_score = EXCLUDED.verification_score,
        mx_found = EXCLUDED.mx_found,
        smtp_valid = EXCLUDED.smtp_valid,
        is_disposable = EXCLUDED.is_disposable,
        is_role_based = EXCLUDED.is_role_based,
        is_catch_all = EXCLUDED.is_catch_all,
        provider = EXCLUDED.provider,
        verified_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        hit_count = global_email_cache.hit_count + 1
    `
    return ok({ inserted: dedupedRows.length, duplicates_skipped: rows.length - dedupedRows.length })
  } catch (e: unknown) {
    return serverError((e as Error).message)
  }
}
