import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

const schema = z.object({
  prompt: z.string().min(10).max(2000),
  tone: z.enum(['professional', 'friendly', 'urgent', 'informational', 'promotional']).default('professional'),
  language: z.string().default('en'),
  subject: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { prompt, tone, language, subject } = parsed.data

    // Get OpenAI config from api_connections
    const rows = await sql`
      SELECT credentials, extra_config FROM api_connections
      WHERE service_name = 'openai' AND is_active = true LIMIT 1
    `
    if (!rows[0]) return error('OpenAI API not configured', 503)

    const creds = rows[0].credentials as Record<string, string>
    const cfg = rows[0].extra_config as Record<string, unknown>

    if (!creds.api_key || creds.api_key.startsWith('sk-YOUR')) {
      return error('OpenAI API key not configured. Update it in Admin > API Connections.', 503)
    }

    const systemPrompt = `You are an expert email copywriter. Write compelling, ${tone} email campaigns.
Return a JSON object with exactly these fields:
- subject: string (email subject line, max 70 chars)
- previewText: string (preview snippet, max 140 chars)  
- htmlContent: string (full HTML email body with inline styles, professional layout)
- textContent: string (plain text version)

Language: ${language}. Keep emails concise, action-oriented, and personalization-ready using {{first_name}} placeholders where appropriate.`

    const userPrompt = subject
      ? `Write an email about: ${prompt}\nDesired subject line: ${subject}`
      : `Write an email about: ${prompt}`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.api_key}`,
      },
      body: JSON.stringify({
        model: (cfg.model as string) || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: (cfg.max_tokens as number) || 4096,
        temperature: (cfg.temperature as number) || 0.7,
      }),
    })

    if (!openaiRes.ok) {
      const errData = await openaiRes.json()
      return error(`OpenAI error: ${errData.error?.message || openaiRes.statusText}`, 502)
    }

    const aiData = await openaiRes.json()
    const content = aiData.choices?.[0]?.message?.content
    if (!content) return error('No content returned from AI', 502)

    const generated = JSON.parse(content)
    return ok({
      subject: generated.subject,
      previewText: generated.previewText,
      htmlContent: generated.htmlContent,
      textContent: generated.textContent,
    })
  } catch (e) {
    console.error('[campaigns/generate]', e)
    return error('AI generation failed', 500)
  }
}
