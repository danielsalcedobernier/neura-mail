import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

// Called after the client finishes uploading to R2.
// Downloads the CSV from R2, parses emails, inserts contacts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params

  const lists = await sql`
    SELECT * FROM email_lists WHERE id = ${id} AND user_id = ${session.id}
  `
  if (!lists[0]) return notFound('List')

  const list = lists[0]
  if (!list.file_url) return error('No file uploaded for this list', 400)

  try {
    // Mark as processing
    await sql`
      UPDATE email_lists SET status = 'processing', processing_started_at = NOW(), processing_progress = 0
      WHERE id = ${id}
    `

    // Download file from R2
    const { getPresignedDownloadUrl } = await import('@/lib/r2')
    const downloadUrl = await getPresignedDownloadUrl(list.file_url, 300)

    const fileRes = await fetch(downloadUrl)
    if (!fileRes.ok) throw new Error('Failed to download list file from storage')
    const text = await fileRes.text()

    // Parse CSV/TXT — extract emails
    const lines = text.split(/\r?\n/)
    const emails: Array<{ email: string; first_name: string | null; last_name: string | null }> = []
    const seen = new Set<string>()
    let duplicateCount = 0

    // Detect if it's CSV with headers
    const firstLine = lines[0]?.toLowerCase() || ''
    const hasHeader = firstLine.includes('email') || firstLine.includes('@') === false
    const startLine = hasHeader && !firstLine.includes('@') ? 1 : 0

    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
      let email = ''
      let first_name: string | null = null
      let last_name: string | null = null

      // Try to find email column
      if (cols[0] && emailRegex.test(cols[0])) {
        email = cols[0].toLowerCase()
        first_name = cols[1] || null
        last_name = cols[2] || null
      } else {
        // Search all columns for an email
        for (const col of cols) {
          if (emailRegex.test(col)) { email = col.toLowerCase(); break }
        }
      }

      if (!email) continue

      if (seen.has(email)) {
        duplicateCount++
        continue
      }
      seen.add(email)
      emails.push({ email, first_name, last_name })
    }

    // Bulk insert in batches of 500
    const BATCH = 500
    let inserted = 0
    for (let i = 0; i < emails.length; i += BATCH) {
      const batch = emails.slice(i, i + BATCH)
      for (const contact of batch) {
        await sql`
          INSERT INTO email_list_contacts (list_id, user_id, email, first_name, last_name)
          VALUES (${id}, ${session.id}, ${contact.email}, ${contact.first_name}, ${contact.last_name})
          ON CONFLICT DO NOTHING
        `
      }
      inserted += batch.length
      const progress = Math.round((inserted / emails.length) * 100)
      await sql`UPDATE email_lists SET processing_progress = ${progress} WHERE id = ${id}`
    }

    await sql`
      UPDATE email_lists SET
        status = 'ready',
        total_count = ${emails.length + duplicateCount},
        valid_count = 0,
        duplicate_count = ${duplicateCount},
        unverified_count = ${emails.length},
        processing_progress = 100,
        processing_completed_at = NOW()
      WHERE id = ${id}
    `

    return ok({ listId: id, totalEmails: emails.length, duplicates: duplicateCount })
  } catch (e) {
    console.error('[lists/process]', e)
    await sql`UPDATE email_lists SET status = 'error' WHERE id = ${id}`
    return error('Failed to process list', 500)
  }
}
