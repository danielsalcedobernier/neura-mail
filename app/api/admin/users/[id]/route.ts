import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden, notFound } from '@/lib/api'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return forbidden() }
  const { id } = await params

  try {
    const body = await request.json()
    const { is_active, role, email_verified, full_name, add_credits, remove_credits, set_credits, plan_id } = body

    if (add_credits && add_credits > 0) {
      const before = await sql`SELECT balance FROM user_credits WHERE user_id = ${id}`
      const prevBalance = Number(before[0]?.balance ?? 0)
      const newBalance = prevBalance + add_credits
      await sql`
        INSERT INTO user_credits (user_id, balance, total_purchased, total_used)
        VALUES (${id}, ${add_credits}, ${add_credits}, 0)
        ON CONFLICT (user_id) DO UPDATE
        SET balance = user_credits.balance + ${add_credits},
            total_purchased = user_credits.total_purchased + ${add_credits},
            updated_at = NOW()
      `
      await sql`
        INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
        VALUES (${id}, ${add_credits}, 'bonus', 'Credits granted by admin', ${newBalance})
      `
    }

    if (remove_credits && remove_credits > 0) {
      const before = await sql`SELECT balance FROM user_credits WHERE user_id = ${id}`
      const prevBalance = Number(before[0]?.balance ?? 0)
      const deducted = Math.min(prevBalance, remove_credits)
      await sql`
        UPDATE user_credits SET balance = GREATEST(0, balance - ${remove_credits}), updated_at = NOW()
        WHERE user_id = ${id}
      `
      await sql`
        INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
        VALUES (${id}, ${-deducted}, 'adjustment', 'Credits removed by admin', ${Math.max(0, prevBalance - deducted)})
      `
    }

    if (plan_id) {
      const plan = await sql`SELECT * FROM plans WHERE id = ${plan_id}`
      if (plan[0]) {
        await sql`UPDATE user_plans SET status = 'expired' WHERE user_id = ${id} AND status = 'active'`
        await sql`
          INSERT INTO user_plans (user_id, plan_id, status, started_at)
          VALUES (${id}, ${plan_id}, 'active', NOW())
        `
        const planCredits = Number(plan[0].credits ?? 0)
        if (planCredits > 0) {
          const before = await sql`SELECT balance FROM user_credits WHERE user_id = ${id}`
          const prevBalance = Number(before[0]?.balance ?? 0)
          await sql`
            INSERT INTO user_credits (user_id, balance, total_purchased, total_used)
            VALUES (${id}, ${planCredits}, ${planCredits}, 0)
            ON CONFLICT (user_id) DO UPDATE
            SET balance = user_credits.balance + ${planCredits},
                total_purchased = user_credits.total_purchased + ${planCredits},
                updated_at = NOW()
          `
          await sql`
            INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
            VALUES (${id}, ${planCredits}, 'purchase', 'Plan credits from admin assignment', ${prevBalance + planCredits})
          `
        }
      }
    }

    if (set_credits !== undefined && set_credits >= 0) {
      const before = await sql`SELECT balance FROM user_credits WHERE user_id = ${id}`
      const prevBalance = Number(before[0]?.balance ?? 0)
      const diff = set_credits - prevBalance
      await sql`
        INSERT INTO user_credits (user_id, balance, total_purchased, total_used)
        VALUES (${id}, ${set_credits}, ${Math.max(0, diff)}, 0)
        ON CONFLICT (user_id) DO UPDATE
        SET balance = ${set_credits}, updated_at = NOW()
      `
      await sql`
        INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
        VALUES (${id}, ${diff}, 'adjustment', 'Balance set by admin', ${set_credits})
      `
    }

    await sql`
      UPDATE users SET
        is_active = COALESCE(${is_active ?? null}, is_active),
        role = COALESCE(${role ?? null}, role),
        full_name = COALESCE(${full_name ?? null}, full_name),
        email_verified = COALESCE(${email_verified ?? null}, email_verified),
        updated_at = NOW()
      WHERE id = ${id}
    `

    return ok({ updated: true })
  } catch (e) {
    console.error('[admin/users PATCH]', e)
    return error('Failed to update user', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch { return forbidden() }
  const { id } = await params

  const rows = await sql`
    UPDATE users SET is_active = false, updated_at = NOW()
    WHERE id = ${id} AND role != 'admin'
    RETURNING id
  `
  if (!rows[0]) return notFound('User')
  return ok({ deactivated: true })
}
