import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

const schema = z.object({
  plan_id: z.string().uuid().optional(),
  credit_package: z.object({
    credits: z.number().int().positive(),
    price_usd: z.number().positive(),
    label: z.string(),
  }).optional(),
})

async function getPayPalAccessToken(clientId: string, clientSecret: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('Failed to get PayPal access token')
  const data = await res.json()
  return data.access_token as string
}

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

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { plan_id, credit_package } = parsed.data
    let amountUsd = 0
    let description = ''
    let credits = 0

    if (plan_id) {
      const plans = await sql`SELECT * FROM credit_packs WHERE id = ${plan_id} AND is_active = true`
      if (!plans[0]) return error('Plan not found', 404)
      amountUsd = Number(plans[0].price_usd)
      credits = plans[0].credits + (plans[0].bonus_credits || 0)
      description = `NeuraMail Credits: ${plans[0].name}`
    } else if (credit_package) {
      amountUsd = credit_package.price_usd
      credits = credit_package.credits
      description = `NeuraMail Credits: ${credit_package.label}`
    } else {
      return error('Must provide plan_id or credit_package', 400)
    }

    const { clientId, clientSecret, baseUrl } = await getPayPalConfig()
    const accessToken = await getPayPalAccessToken(clientId, clientSecret, baseUrl)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: amountUsd.toFixed(2) },
          description,
          custom_id: JSON.stringify({ user_id: session.id, plan_id: plan_id || null, credits }),
        }],
        application_context: {
          return_url: `${appUrl}/dashboard/credits?payment=success`,
          cancel_url: `${appUrl}/dashboard/credits?payment=cancelled`,
          brand_name: 'NeuraMail',
          user_action: 'PAY_NOW',
        },
      }),
    })

    if (!orderRes.ok) {
      const errData = await orderRes.json()
      return error(`PayPal error: ${errData.message || 'Order creation failed'}`, 502)
    }

    const orderData = await orderRes.json()

    // Store pending order in paypal_orders table
    await sql`
      INSERT INTO paypal_orders (user_id, paypal_order_id, status, amount, currency, type,
                                  credit_pack_id, metadata)
      VALUES (${session.id}, ${orderData.id}, 'created', ${amountUsd}, 'USD',
              ${plan_id ? 'credit_pack' : 'credits'},
              ${plan_id || null},
              ${JSON.stringify({ credits, description, order_id: orderData.id })})
    `

    const approveLink = orderData.links?.find((l: { rel: string }) => l.rel === 'approve')?.href
    return ok({ orderId: orderData.id, approveUrl: approveLink })
  } catch (e) {
    console.error('[credits/create-order]', e)
    return error('Failed to create payment order', 500)
  }
}
