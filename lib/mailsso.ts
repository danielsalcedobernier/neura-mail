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

  const url = new URL(`${config.baseUrl}/validate`)
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
  // spec result enum: deliverable | undeliverable | risky | unknown
  // catch_all is signaled by reason === 'catch_all' or !isv_nocatchall, not by result field
  const isCatchAll = r.reason === 'catch_all' || r.isv_nocatchall === false

  let status: VerificationResult['status'] = 'unknown'
  if (isCatchAll) status = 'catch_all'
  else if (r.result === 'deliverable') status = 'valid'
  else if (r.result === 'undeliverable') status = 'invalid'
  else if (r.result === 'risky') status = 'risky'

  return {
    email,
    status,
    score: (r.score as number) ?? 0,
    mx_found: (r.isv_mx as boolean) ?? false,
    smtp_valid: (r.isv_format as boolean) ?? false,
    is_disposable: r.reason === 'disposable',
    is_role_based: r.isv_nogeneric === false,
    is_catch_all: isCatchAll,
    provider: (r.mx_record as string) || '',
    raw: r,
  }
}

// Submit up to 50,000 emails to mails.so batch API
// Returns the async batch job id — results are not immediate
export async function submitBatch(emails: string[]): Promise<string> {
  const config = await getConfig()
  const batchUrl = `${config.baseUrl}/batch`.replace(/\/+/g, '/').replace('https:/', 'https://')
  console.log(`[mailsso] submitBatch url=${batchUrl} emails=${emails.length} apiKey=${config.apiKey ? config.apiKey.slice(0,8)+'...' : 'MISSING'}`)

  const res = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      'x-mails-api-key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ emails }),
  })

  if (!res.ok) {
    const rawText = await res.text().catch(() => res.statusText)
    console.error(`[mailsso] submitBatch failed: status=${res.status} url=${batchUrl} body=${rawText}`)
    let errMsg = res.statusText
    try { errMsg = JSON.parse(rawText)?.error || rawText } catch {}
    throw new Error(`mails.so batch error: ${res.status} — ${errMsg}`)
  }

  const data = await res.json()
  console.log(`[mailsso] submitBatch success: batchId=${data.id ?? data.data?.id}`)
  return (data.id ?? data.data?.id) as string
}

// Poll for batch results — returns null if still processing
// Never blocks more than 15s so the cron stays within Vercel's 60s timeout
export async function pollBatch(batchId: string): Promise<VerificationResult[] | null> {
  const config = await getConfig()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  let res: Response
  try {
    res = await fetch(`${config.baseUrl}/batch/${batchId}`, {
      headers: { 'x-mails-api-key': config.apiKey },
      signal: controller.signal,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.warn(`[mailsso] pollBatch timed out after 15s — batchId=${batchId}`)
      return null // treat as still processing
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) throw new Error(`mails.so poll error: ${res.status}`)

  // The spec wraps responses in { data, error } — handle both wrapped and unwrapped
  const body = await res.json()
  const data = body.data ?? body

  // Still processing — finished_at is null or emails not yet populated
  if (!data.finished_at) {
    console.log(`[mailsso] pollBatch not ready yet — batchId=${batchId}`)
    return null
  }
  if (!Array.isArray(data.emails) || data.emails.length === 0) return null

  console.log(`[mailsso] pollBatch ready — batchId=${batchId} results=${data.emails.length}`)
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
  await sql`UPDATE global_email_cache SET hit_count = hit_count + 1 WHERE email = ${email.toLowerCase()}`
  return rowToResult(rows[0])
}

// Bulk cache lookup — 1 query for up to 50k emails
export async function checkCacheBulk(
  emails: string[]
): Promise<Map<string, VerificationResult>> {
  if (emails.length === 0) return new Map()
  const normalized = emails.map(e => e.toLowerCase())
  const rows = await sql`
    SELECT * FROM global_email_cache
    WHERE email = ANY(${normalized}::text[]) AND expires_at > NOW()
  `
  // Bump hit counts in one query
  if (rows.length > 0) {
    const hits = rows.map((r: Record<string, unknown>) => r.email as string)
    await sql`
      UPDATE global_email_cache SET hit_count = hit_count + 1
      WHERE email = ANY(${hits}::text[])
    `
  }
  return new Map(rows.map((r: Record<string, unknown>) => [r.email as string, rowToResult(r)]))
}

// Bulk insert/update cache results — 1 query for the whole batch
export async function storeBatchInCache(
  results: VerificationResult[],
  verifiedByUserId?: string
): Promise<void> {
  if (results.length === 0) return
  const values = results.map(r => ({
    email: r.email.toLowerCase(),
    verification_status: r.status,
    verification_score: r.score,
    mx_found: r.mx_found,
    smtp_valid: r.smtp_valid,
    is_disposable: r.is_disposable,
    is_role_based: r.is_role_based,
    is_catch_all: r.is_catch_all,
    provider: r.provider,
    raw_response: JSON.stringify(r.raw),
    verified_by_user_id: verifiedByUserId || null,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }))
  await sql`
    INSERT INTO global_email_cache ${sql(values,
      'email', 'verification_status', 'verification_score',
      'mx_found', 'smtp_valid', 'is_disposable', 'is_role_based', 'is_catch_all',
      'provider', 'raw_response', 'verified_by_user_id', 'expires_at'
    )}
    ON CONFLICT (email) DO UPDATE SET
      verification_status  = EXCLUDED.verification_status,
      verification_score   = EXCLUDED.verification_score,
      mx_found             = EXCLUDED.mx_found,
      smtp_valid           = EXCLUDED.smtp_valid,
      is_disposable        = EXCLUDED.is_disposable,
      is_role_based        = EXCLUDED.is_role_based,
      is_catch_all         = EXCLUDED.is_catch_all,
      provider             = EXCLUDED.provider,
      raw_response         = EXCLUDED.raw_response,
      verified_at          = NOW(),
      expires_at           = EXCLUDED.expires_at,
      hit_count            = global_email_cache.hit_count + 1
  `
}

function rowToResult(r: Record<string, unknown>): VerificationResult {
  return {
    email: r.email as string,
    status: r.verification_status as VerificationResult['status'],
    score: Number(r.verification_score) || 0,
    mx_found: (r.mx_found as boolean) ?? false,
    smtp_valid: (r.smtp_valid as boolean) ?? false,
    is_disposable: (r.is_disposable as boolean) ?? false,
    is_role_based: (r.is_role_based as boolean) ?? false,
    is_catch_all: (r.is_catch_all as boolean) ?? false,
    provider: (r.provider as string) || '',
    raw: (r.raw_response as Record<string, unknown>) || {},
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
