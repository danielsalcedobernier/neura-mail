import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

const schema = z.object({ orderId: z.string().min(1) })

async function getPayPalConfig() {
  const rows = await sql`
    SELECT credentials, extra_config FROM api_connections
    WHERE service_name = 'paypal' AND is_active = true LIMIT 1
  `
  if (!rows[0]) throw new Error('PayPal not configured')
  const creds = rows[0].credentials as Record<string, string>
  const cfg = rows[0].extra_config as Record<string, string>
  const isSandbox = cfg.mode !== 'live'
  const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
  return { clientId: creds.client_id, clientSecret: creds.client_secret, baseUrl }
}

async function getPayPalAccessToken(clientId: string, clientSecret: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  return data.access_token as string
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { orderId } = parsed.data

    // Verify transaction belongs to this user
    const txRows = await sql`
      SELECT * FROM credit_transactions
      WHERE payment_id = ${orderId} AND user_id = ${session.id} AND status = 'pending'
    `
    if (!txRows[0]) return error('Transaction not found or already processed', 404)

    const { clientId, clientSecret, baseUrl } = await getPayPalConfig()
    const accessToken = await getPayPalAccessToken(clientId, clientSecret, baseUrl)

    // Capture order
    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    const captureData = await captureRes.json()
    if (!captureRes.ok || captureData.status !== 'COMPLETED') {
      await sql`
        UPDATE credit_transactions SET status = 'failed', updated_at = NOW()
        WHERE payment_id = ${orderId}
      `
      return error(`Payment capture failed: ${captureData.message || captureData.status}`, 400)
    }

    const tx = txRows[0]
    const meta = tx.metadata as Record<string, unknown>

    // Add credits to user balance
    await sql`
      UPDATE user_credits SET balance = balance + ${tx.amount}, updated_at = NOW()
      WHERE user_id = ${session.id}
    `
    await sql`
      UPDATE credit_transactions SET status = 'completed', processed_at = NOW(), updated_at = NOW()
      WHERE payment_id = ${orderId}
    `

    // Activate plan if this was a plan purchase
    if (meta.plan_id) {
      const plans = await sql`SELECT * FROM plans WHERE id = ${meta.plan_id}`
      if (plans[0]) {
        await sql`UPDATE user_plans SET status = 'expired' WHERE user_id = ${session.id} AND status = 'active'`
        await sql`
          INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at)
          VALUES (${session.id}, ${meta.plan_id as string}, 'active', NOW(),
            CASE WHEN ${plans[0].duration_days} IS NOT NULL
                 THEN NOW() + (${plans[0].duration_days} || ' days')::INTERVAL
                 ELSE NULL END)
        `
      }
    }

    const newBalance = await sql`SELECT balance FROM user_credits WHERE user_id = ${session.id}`
    return ok({
      success: true,
      creditsAdded: tx.amount,
      newBalance: newBalance[0]?.balance ?? 0,
    })
  } catch (e) {
    console.error('[credits/capture-order]', e)
    return error('Failed to capture payment', 500)
  }
}
