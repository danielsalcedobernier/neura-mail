import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden, notFound } from '@/lib/api'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }
  const { id } = await params

  try {
    const body = await request.json()
    const { is_active, role, email_verified, add_credits, remove_credits, plan_id } = body

    if (add_credits && add_credits > 0) {
      await sql`
        UPDATE user_credits SET balance = balance + ${add_credits}, updated_at = NOW()
        WHERE user_id = ${id}
      `
      await sql`
        INSERT INTO credit_transactions (user_id, amount, type, description, status, processed_at)
        VALUES (${id}, ${add_credits}, 'admin_grant', 'Credits granted by admin', 'completed', NOW())
      `
    }
    if (remove_credits && remove_credits > 0) {
      await sql`
        UPDATE user_credits SET balance = GREATEST(0, balance - ${remove_credits}), updated_at = NOW()
        WHERE user_id = ${id}
      `
    }

    if (plan_id) {
      const plan = await sql`SELECT * FROM plans WHERE id = ${plan_id}`
      if (plan[0]) {
        await sql`
          UPDATE user_plans SET status = 'expired', updated_at = NOW()
          WHERE user_id = ${id} AND status = 'active'
        `
        await sql`
          INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at)
          VALUES (${id}, ${plan_id}, 'active', NOW(),
            CASE WHEN ${plan[0].duration_days} IS NOT NULL THEN NOW() + (${plan[0].duration_days} || ' days')::INTERVAL ELSE NULL END)
        `
        // Grant plan credits
        if (plan[0].credits_included > 0) {
          await sql`
            UPDATE user_credits SET balance = balance + ${plan[0].credits_included}, updated_at = NOW()
            WHERE user_id = ${id}
          `
        }
      }
    }

    await sql`
      UPDATE users SET
        is_active = COALESCE(${is_active ?? null}, is_active),
        role = COALESCE(${role ?? null}, role),
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
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }
  const { id } = await params

  // Soft delete: deactivate
  const rows = await sql`
    UPDATE users SET is_active = false, updated_at = NOW()
    WHERE id = ${id} AND role != 'admin'
    RETURNING id
  `
  if (!rows[0]) return notFound('User')
  return ok({ deactivated: true })
}
