import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { getPresignedUploadUrl, generateFileKey } from '@/lib/r2'
import { ok, error, unauthorized } from '@/lib/api'

const schema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  contentType: z.string(),
  listId: z.string().uuid().optional(),
  listName: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { fileName, fileSize, contentType, listId, listName } = parsed.data

    // 500MB max
    if (fileSize > 500 * 1024 * 1024) {
      return error('File too large. Maximum size is 500MB.', 413)
    }

    const key = generateFileKey(session.id, fileName)

    let targetListId = listId
    if (!targetListId) {
      // Create a new list record
      const name = listName || fileName.replace(/\.[^.]+$/, '')
      const rows = await sql`
        INSERT INTO email_lists (user_id, name, file_name, file_size_bytes, status)
        VALUES (${session.id}, ${name}, ${fileName}, ${fileSize}, 'pending')
        RETURNING id
      `
      targetListId = rows[0].id
    } else {
      // Update existing list
      await sql`
        UPDATE email_lists
        SET file_name = ${fileName}, file_size_bytes = ${fileSize}, status = 'pending'
        WHERE id = ${targetListId} AND user_id = ${session.id}
      `
    }

    const uploadUrl = await getPresignedUploadUrl(key, contentType, 900)

    // Store the R2 key so we can process it later
    await sql`
      UPDATE email_lists SET file_url = ${key} WHERE id = ${targetListId}
    `

    return ok({ uploadUrl, key, listId: targetListId })
  } catch (e) {
    console.error('[lists/upload]', e)
    return error('Failed to generate upload URL', 500)
  }
}
