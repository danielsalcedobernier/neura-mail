import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, forbidden } from '@/lib/api'

const schema = z.object({
  service_name: z.string().min(1),
  display_name: z.string().min(1),
  credentials: z.record(z.string()),
  extra_config: z.record(z.unknown()).optional(),
  is_active: z.boolean().default(true),
})

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }

  const connections = await sql`
    SELECT id, service_name, display_name, is_active, extra_config, created_at, updated_at,
           -- mask credentials for security, only show key names
           (SELECT jsonb_object_agg(key, REPEAT('*', 8)) FROM jsonb_each_text(credentials)) as credentials_masked
    FROM api_connections
    ORDER BY display_name ASC
  `
  return ok(connections)
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return forbidden()
  }

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const d = parsed.data
    const rows = await sql`
      INSERT INTO api_connections (service_name, display_name, credentials, extra_config, is_active)
      VALUES (${d.service_name}, ${d.display_name}, ${JSON.stringify(d.credentials)},
              ${JSON.stringify(d.extra_config || {})}, ${d.is_active})
      ON CONFLICT (service_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        credentials = EXCLUDED.credentials,
        extra_config = EXCLUDED.extra_config,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING id, service_name, display_name, is_active, created_at
    `
    return ok(rows[0], 201)
  } catch (e) {
    console.error('[admin/api-connections POST]', e)
    return error('Failed to save API connection', 500)
  }
}
