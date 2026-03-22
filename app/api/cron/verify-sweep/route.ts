import { ok } from '@/lib/api'

// Disabled — cache sweeping is now handled by the browser-based worker pipeline at /admin/worker
export async function GET() {
  return ok({ skipped: true, reason: 'Handled by browser worker' })
}
