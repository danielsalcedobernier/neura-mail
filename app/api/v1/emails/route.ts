import { NextRequest } from 'next/server'
import { z } from 'zod'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import sql from '@/lib/db'
import { ok, error } from '@/lib/api'
import { createHash, randomBytes } from 'crypto'

// ── Auth ──────────────────────────────────────────────────────────────────────
async function authenticateTransactionalKey(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!rawKey) return null

  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const rows = await sql`
    SELECT k.id, k.user_id, k.name, k.daily_limit, k.sent_today,
           s.aws_access_key_id, s.aws_secret_access_key, s.aws_region
    FROM transactional_api_keys k
    JOIN ses_configurations s ON s.user_id = k.user_id AND s.is_active = true
    WHERE k.key_hash = ${keyHash} AND k.is_active = true
  `
  return rows[0] || null
}

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  from:    z.string().email(),
  to:      z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1).max(500),
  html:    z.string().optional(),
  text:    z.string().optional(),
  reply_to: z.string().email().optional(),
  cc:      z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc:     z.union([z.string().email(), z.array(z.string().email())]).optional(),
  tags:    z.record(z.string()).optional(),
})

// ── POST /api/v1/emails ───────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateTransactionalKey(request)
  if (!auth) return error('Invalid or missing API key', 401)

  // Daily limit check
  if (auth.daily_limit && Number(auth.sent_today) >= Number(auth.daily_limit)) {
    return error('Daily sending limit reached for this API key', 429)
  }

  let body: unknown
  try { body = await request.json() } catch { return error('Invalid JSON body', 400) }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? 'Invalid payload', 422)

  const { from, to, subject, html, text, reply_to, cc, bcc, tags } = parsed.data

  if (!html && !text) return error('At least one of html or text is required', 422)

  const toList  = Array.isArray(to)  ? to  : [to]
  const ccList  = cc  ? (Array.isArray(cc)  ? cc  : [cc])  : []
  const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : []

  // Verify sender domain is allowed for this user
  const fromDomain = from.split('@')[1]
  const domainRows = await sql`
    SELECT id FROM sending_domains
    WHERE user_id = ${auth.user_id} AND domain = ${fromDomain} AND status = 'verified'
  `
  if (domainRows.length === 0) {
    return error(`Domain "${fromDomain}" is not verified. Add it in your developer settings.`, 403)
  }

  const messageId = `nm_${randomBytes(16).toString('hex')}`

  // ── Send via SES ─────────────────────────────────────────────────────────────
  try {
    const ses = new SESClient({
      region: auth.aws_region as string,
      credentials: {
        accessKeyId:     auth.aws_access_key_id as string,
        secretAccessKey: auth.aws_secret_access_key as string,
      },
    })

    const cmd = new SendEmailCommand({
      Source: from,
      Destination: {
        ToAddresses:  toList,
        CcAddresses:  ccList,
        BccAddresses: bccList,
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          ...(html ? { Html: { Data: html,  Charset: 'UTF-8' } } : {}),
          ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
        },
      },
      ...(reply_to ? { ReplyToAddresses: [reply_to] } : {}),
    })

    await ses.send(cmd)

    // Log the email
    await sql`
      INSERT INTO transactional_emails (
        id, user_id, api_key_id, from_email, to_emails, subject,
        status, tags, sent_at
      ) VALUES (
        ${messageId}, ${auth.user_id}, ${auth.id},
        ${from}, ${JSON.stringify(toList)}, ${subject},
        'sent', ${JSON.stringify(tags ?? {})}, NOW()
      )
    `

    // Increment sent_today counter on the key
    await sql`
      UPDATE transactional_api_keys
      SET sent_today = sent_today + 1, updated_at = NOW()
      WHERE id = ${auth.id}
    `

    return ok({ id: messageId }, 200)

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'SES send failed'
    // Log failed attempt
    await sql`
      INSERT INTO transactional_emails (
        id, user_id, api_key_id, from_email, to_emails, subject, status, error_message
      ) VALUES (
        ${messageId}, ${auth.user_id}, ${auth.id},
        ${from}, ${JSON.stringify(toList)}, ${subject}, 'failed', ${msg}
      )
    `.catch(() => {})
    return error(msg, 500)
  }
}
