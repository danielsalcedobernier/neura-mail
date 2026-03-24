import sql from '@/lib/db'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

interface ResendConfig {
  apiKey: string
  fromEmail: string
  fromName: string
  replyTo?: string
}

async function getResendConfig(): Promise<ResendConfig> {
  const rows = await sql`
    SELECT credentials, extra_config FROM api_connections
    WHERE service_name = 'resend' AND is_active = true
    LIMIT 1
  `
  if (!rows[0]) throw new Error('Resend API connection not configured in api_connections table')
  const creds = rows[0].credentials as Record<string, string>
  const extra = (rows[0].extra_config ?? {}) as Record<string, string>
  return {
    apiKey: creds.api_key,
    fromEmail: extra.from_email ?? 'noreply@neuramail.cl',
    fromName: extra.from_name ?? 'NeuraMail',
    replyTo: extra.reply_to,
  }
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  const { apiKey, fromEmail, fromName, replyTo } = await getResendConfig()

  const body: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, ''),
  }
  if (replyTo) body.reply_to = replyTo

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error: ${err}`)
  }
}

// ── Email templates ────────────────────────────────────────────

export function verificationEmailHtml(verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d4e;">
    <h1 style="color: #6366f1; margin: 0 0 8px;">Neura Mail</h1>
    <h2 style="color: #e2e8f0; margin: 0 0 24px; font-size: 20px;">Verify your email address</h2>
    <p style="color: #94a3b8; line-height: 1.6; margin: 0 0 32px;">
      Welcome to NeuraMail! Click the button below to verify your email address and activate your account.
    </p>
    <a href="${verifyUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-bottom: 24px;">
      Verify Email Address
    </a>
    <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">
      This link expires in 24 hours. If you did not create an account, please ignore this email.
    </p>
    <p style="color: #64748b; font-size: 12px; word-break: break-all;">${verifyUrl}</p>
  </div>
  <p style="text-align: center; color: #475569; font-size: 12px; margin-top: 24px;">
    &copy; ${new Date().getFullYear()} NeuraMail. All rights reserved.
  </p>
</body>
</html>
  `
}

export function resetPasswordEmailHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: Arial, sans-serif; background: #0f0f1a; color: #e2e8f0; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #1a1a2e; border-radius: 12px; padding: 40px; border: 1px solid #2d2d4e;">
    <h1 style="color: #6366f1; margin: 0 0 8px;">Neura Mail</h1>
    <h2 style="color: #e2e8f0; margin: 0 0 24px; font-size: 20px;">Reset your password</h2>
    <p style="color: #94a3b8; line-height: 1.6; margin: 0 0 32px;">
      We received a request to reset the password for your NeuraMail account. Click the button below to choose a new password.
    </p>
    <a href="${resetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-bottom: 24px;">
      Reset Password
    </a>
    <p style="color: #64748b; font-size: 14px; margin: 0 0 8px;">
      This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
    </p>
    <p style="color: #64748b; font-size: 12px; word-break: break-all;">${resetUrl}</p>
  </div>
  <p style="text-align: center; color: #475569; font-size: 12px; margin-top: 24px;">
    &copy; ${new Date().getFullYear()} NeuraMail. All rights reserved.
  </p>
</body>
</html>
  `
}
