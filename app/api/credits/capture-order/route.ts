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

    // Verify order belongs to this user and is not already captured
    const orderRows = await sql`
      SELECT * FROM paypal_orders
      WHERE paypal_order_id = ${orderId} AND user_id = ${session.id}
        AND status NOT IN ('completed', 'failed')
    `
    if (!orderRows[0]) return error('Order not found or already processed', 404)

    const { clientId, clientSecret, baseUrl } = await getPayPalConfig()
    const accessToken = await getPayPalAccessToken(clientId, clientSecret, baseUrl)

    // Capture payment from PayPal
    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    const captureData = await captureRes.json()
    if (!captureRes.ok || captureData.status !== 'COMPLETED') {
      await sql`UPDATE paypal_orders SET status = 'failed', updated_at = NOW() WHERE paypal_order_id = ${orderId}`
      return error(`Payment capture failed: ${captureData.message || captureData.status}`, 400)
    }

    const order = orderRows[0]
    const meta = order.metadata as Record<string, unknown>
    const creditsToAdd = Number(meta.credits || 0)

    // Mark order as completed
    await sql`
      UPDATE paypal_orders SET
        status = 'completed', paypal_payment_id = ${captureData.id || null}, updated_at = NOW()
      WHERE paypal_order_id = ${orderId}
    `

    // Ensure user_credits row exists and add balance
    await sql`
      INSERT INTO user_credits (user_id, balance, total_purchased, total_used)
      VALUES (${session.id}, ${creditsToAdd}, ${creditsToAdd}, 0)
      ON CONFLICT (user_id) DO UPDATE SET
        balance = user_credits.balance + ${creditsToAdd},
        total_purchased = user_credits.total_purchased + ${creditsToAdd},
        updated_at = NOW()
    `

    // Log credit transaction
    const newBalanceRow = await sql`SELECT balance FROM user_credits WHERE user_id = ${session.id}`
    const newBalance = Number(newBalanceRow[0]?.balance ?? 0)

    await sql`
      INSERT INTO credit_transactions (user_id, amount, type, description, balance_after, reference_id)
      VALUES (${session.id}, ${creditsToAdd}, 'purchase',
              ${meta.description as string || 'Credit purchase'},
              ${newBalance}, ${order.id})
    `

    return ok({
      success: true,
      creditsAdded: creditsToAdd,
      newBalance,
    })
  } catch (e) {
    console.error('[credits/capture-order]', e)
    return error('Failed to capture payment', 500)
  }
}
