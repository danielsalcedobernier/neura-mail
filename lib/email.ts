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
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e1117;font-family:'Geist',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1117;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#141828;border:1px solid #2a2f45;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px;text-align:center;border-bottom:1px solid #2a2f45;">
            <span style="font-size:22px;font-weight:700;color:#ffffff;">Neura<span style="color:#4f87ff;">Mail</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#f0f4ff;font-weight:600;">Verify your email address</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#8b95b3;line-height:1.6;">
              Welcome to NeuraMail! Click the button below to verify your email address and activate your account.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${verifyUrl}"
                 style="display:inline-block;background:#4f87ff;color:#ffffff;font-size:14px;font-weight:600;
                        padding:12px 28px;border-radius:8px;text-decoration:none;">
                Verify Email Address
              </a>
            </div>
            <p style="margin:24px 0 0;font-size:12px;color:#5a6480;text-align:center;">
              This link expires in 24 hours. If you did not create an account, please ignore this email.
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#3d4560;text-align:center;word-break:break-all;">
              ${verifyUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #2a2f45;text-align:center;">
            <p style="margin:0;font-size:11px;color:#3d4560;">© ${new Date().getFullYear()} NeuraMail. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function resetPasswordEmailHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e1117;font-family:'Geist',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0e1117;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#141828;border:1px solid #2a2f45;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px;text-align:center;border-bottom:1px solid #2a2f45;">
            <span style="font-size:22px;font-weight:700;color:#ffffff;">Neura<span style="color:#4f87ff;">Mail</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#f0f4ff;font-weight:600;">Reset your password</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#8b95b3;line-height:1.6;">
              We received a request to reset the password for your NeuraMail account. Click the button below to choose a new password.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${resetUrl}"
                 style="display:inline-block;background:#4f87ff;color:#ffffff;font-size:14px;font-weight:600;
                        padding:12px 28px;border-radius:8px;text-decoration:none;">
                Reset Password
              </a>
            </div>
            <p style="margin:24px 0 0;font-size:12px;color:#5a6480;text-align:center;">
              This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#3d4560;text-align:center;word-break:break-all;">
              ${resetUrl}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #2a2f45;text-align:center;">
            <p style="margin:0;font-size:11px;color:#3d4560;">© ${new Date().getFullYear()} NeuraMail. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
