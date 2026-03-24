import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { unauthorized, error } from '@/lib/api'

// GET /api/lists/[id]/export?filter=all|valid
// Returns contacts as NDJSON (one JSON object per line) for client-side CSV generation
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  const filter = request.nextUrl.searchParams.get('filter') ?? 'all'

  // Verify ownership
  const rows = await sql`SELECT id FROM email_lists WHERE id = ${id} AND user_id = ${session.id}`
  if (rows.length === 0) return error('Not found', 404)

  const PAGE = 50_000
  let offset = 0

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const contacts = await sql`
            SELECT email, first_name, last_name, verification_status
            FROM email_list_contacts
            WHERE list_id = ${id}
              ${filter === 'valid' ? sql`AND verification_status = 'valid'` : sql``}
            ORDER BY id
            LIMIT ${PAGE} OFFSET ${offset}
          `
          if (contacts.length === 0) break
          for (const c of contacts) {
            controller.enqueue(encoder.encode(JSON.stringify(c) + '\n'))
          }
          offset += contacts.length
          if (contacts.length < PAGE) break
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-store',
    },
  })
}
