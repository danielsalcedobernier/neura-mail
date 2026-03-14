import { getSession } from '@/lib/auth'
import { ok, unauthorized } from '@/lib/api'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()
  return ok(session)
}
