// Verification processing has been moved to the browser-based worker at /admin/worker.
// This cron is intentionally disabled to avoid Vercel 55s timeout conflicts.
// The VPS running the browser worker handles all verification work.
import { ok } from '@/lib/api'

export async function GET() {
  return ok({ skipped: true, reason: 'Handled by browser worker at /admin/worker' })
}
