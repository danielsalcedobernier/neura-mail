import sql from './db'

interface MailssoConfig {
  apiKey: string
  baseUrl: string
  batchSize: number
}

interface VerificationResult {
  email: string
  status: 'valid' | 'invalid' | 'risky' | 'unknown' | 'catch_all'
  score: number
  mx_found: boolean
  smtp_valid: boolean
  is_disposable: boolean
  is_role_based: boolean
  is_catch_all: boolean
  provider: string
  raw: Record<string, unknown>
}

async function getConfig(): Promise<MailssoConfig> {
  const rows = await sql`
    SELECT credentials, extra_config FROM api_connections
    WHERE service_name = 'mails_so' AND is_active = true
  `
  if (!rows[0]) throw new Error('mails.so not configured')
  const creds = rows[0].credentials as Record<string, string>
  const config = rows[0].extra_config as Record<string, string | number>
  return {
    apiKey: creds.api_key,
    baseUrl: (config.base_url as string) || 'https://api.mails.so/v1',
    batchSize: (config.batch_size as number) || 100,
  }
}

export async function verifyEmail(email: string): Promise<VerificationResult> {
  const config = await getConfig()

  const url = new URL(`${config.baseUrl}/verify`)
  url.searchParams.set('email', email)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'x-mails-api-key': config.apiKey },
  })

  if (!res.ok) {
    throw new Error(`mails.so API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return mapResult(email, data.data || data)
}

function mapResult(email: string, r: Record<string, unknown>): VerificationResult {
  let status: VerificationResult['status'] = 'unknown'
  if (r.result === 'deliverable') status = 'valid'
  else if (r.result === 'undeliverable') status = 'invalid'
  else if (r.result === 'risky') status = 'risky'
  else if (r.result === 'catch_all') status = 'catch_all'

  return {
    email,
    status,
    score: (r.score as number) ?? 0,
    mx_found: (r.isv_mx as boolean) ?? false,
    smtp_valid: (r.isv_format as boolean) ?? false,
    is_disposable: false,
    is_role_based: !(r.isv_nogeneric as boolean),
    is_catch_all: !(r.isv_nocatchall as boolean),
    provider: (r.mx_record as string) || '',
    raw: r,
  }
}

// Submit up to 50,000 emails to mails.so batch API
// Returns the async batch job id — results are not immediate
export async function submitBatch(emails: string[]): Promise<string> {
  const config = await getConfig()

  const res = await fetch(`${config.baseUrl}/batch`, {
    method: 'POST',
    headers: {
      'x-mails-api-key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ emails }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`mails.so batch error: ${res.status} — ${err.error || res.statusText}`)
  }

  const data = await res.json()
  return data.id as string
}

// Poll for batch results — returns null if still processing
export async function pollBatch(batchId: string): Promise<VerificationResult[] | null> {
  const config = await getConfig()

  const res = await fetch(`${config.baseUrl}/batch/${batchId}`, {
    headers: { 'x-mails-api-key': config.apiKey },
  })

  if (!res.ok) throw new Error(`mails.so poll error: ${res.status}`)

  const data = await res.json()

  // Still processing — finished_at is null
  if (!data.finished_at) return null

  return (data.emails as Record<string, unknown>[]).map(r =>
    mapResult(r.email as string, r)
  )
}

export async function checkCacheFirst(email: string): Promise<VerificationResult | null> {
  const rows = await sql`
    SELECT * FROM global_email_cache
    WHERE email = ${email.toLowerCase()} AND expires_at > NOW()
  `
  if (!rows[0]) return null

  const cached = rows[0]
  // Bump hit count
  await sql`UPDATE global_email_cache SET hit_count = hit_count + 1 WHERE email = ${email.toLowerCase()}`

  return {
    email: cached.email,
    status: cached.verification_status,
    score: Number(cached.verification_score) || 0,
    mx_found: cached.mx_found ?? false,
    smtp_valid: cached.smtp_valid ?? false,
    is_disposable: cached.is_disposable ?? false,
    is_role_based: cached.is_role_based ?? false,
    is_catch_all: cached.is_catch_all ?? false,
    provider: cached.provider || '',
    raw: cached.raw_response || {},
  }
}

export async function storeInCache(result: VerificationResult, verifiedByUserId?: string): Promise<void> {
  await sql`
    INSERT INTO global_email_cache (
      email, verification_status, verification_score,
      mx_found, smtp_valid, is_disposable, is_role_based, is_catch_all,
      provider, raw_response, verified_by_user_id, expires_at
    ) VALUES (
      ${result.email.toLowerCase()}, ${result.status}, ${result.score},
      ${result.mx_found}, ${result.smtp_valid}, ${result.is_disposable},
      ${result.is_role_based}, ${result.is_catch_all}, ${result.provider},
      ${JSON.stringify(result.raw)}, ${verifiedByUserId || null},
      NOW() + INTERVAL '30 days'
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
      raw_response = EXCLUDED.raw_response,
      verified_at = NOW(),
      expires_at = NOW() + INTERVAL '30 days',
      hit_count = global_email_cache.hit_count + 1
  `
}
