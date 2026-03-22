import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized } from '@/lib/api'

const schema = z.object({
  prompt: z.string().min(3).max(2000),
  tone: z.enum(['professional', 'friendly', 'urgent', 'informational', 'promotional']).default('professional'),
  language: z.string().default('es'),
  subject: z.string().optional(),
})

// Detect URLs in prompt and fetch their content
async function extractUrlContent(prompt: string): Promise<{ cleanPrompt: string; webContent: string }> {
  const urlRegex = /https?:\/\/[^\s]+/g
  const urls = prompt.match(urlRegex) || []
  if (urls.length === 0) return { cleanPrompt: prompt, webContent: '' }

  const fetches = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NeuraMail/1.0)' },
        signal: AbortSignal.timeout(8000),
      })
      const html = await res.text()
      // Extract readable text — strip tags, collapse whitespace
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000)
      return { url, text }
    })
  )

  const webContent = fetches
    .filter((r): r is PromiseFulfilledResult<{ url: string; text: string }> => r.status === 'fulfilled')
    .map(r => `--- Content from ${r.value.url} ---\n${r.value.text}`)
    .join('\n\n')

  const cleanPrompt = prompt.replace(urlRegex, '').trim()
  return { cleanPrompt, webContent }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return error('Invalid input', 422)

    const { prompt, tone, subject } = parsed.data
    // Use language from request, fallback to browser Accept-Language, fallback to 'es'
    const acceptLang = request.headers.get('accept-language') || ''
    const detectedLang = parsed.data.language !== 'es'
      ? parsed.data.language
      : (acceptLang.split(',')[0]?.split('-')[0]?.toLowerCase() || 'es')

    const { cleanPrompt, webContent } = await extractUrlContent(prompt)

    // Get OpenAI config
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

    const langNames: Record<string, string> = {
      es: 'Spanish', en: 'English', pt: 'Portuguese', fr: 'French',
      de: 'German', it: 'Italian', nl: 'Dutch',
    }
    const langName = langNames[detectedLang] || detectedLang

    const systemPrompt = `You are an expert email copywriter. Write compelling, ${tone} email campaigns.

IMPORTANT: You MUST respond in ${langName} (language code: ${detectedLang}). ALL text (subject, body, CTAs) must be in ${langName}.

Return a JSON object with exactly these fields:
- subject: string (email subject line, max 70 chars, in ${langName})
- previewText: string (preview snippet, max 140 chars, in ${langName})
- htmlContent: string (full HTML email with inline styles — see requirements below)
- textContent: string (plain text version, in ${langName})

HTML EMAIL REQUIREMENTS:
- Use a single-column layout, max-width 600px, centered
- Include a header section with background color and logo placeholder
- Use a clear hierarchy: headline → body text → CTA button
- CTA button must use inline styles: background-color, color, padding, border-radius, text-decoration:none, display:inline-block
- Use web-safe fonts (Arial, Georgia) with proper line-height
- Include a footer with unsubscribe placeholder: <a href="{{unsubscribe_url}}">Unsubscribe</a>
- All styles must be inline (no <style> tags) for email client compatibility
- Use {{first_name}} placeholder for personalization
- Make it visually appealing with proper spacing and colors relevant to the campaign tone`

    const userParts: string[] = []
    if (webContent) {
      userParts.push(`I want to create a campaign based on this website content:\n\n${webContent}`)
    }
    userParts.push(cleanPrompt || 'Create a compelling email campaign based on the website content above.')
    if (subject) userParts.push(`Desired subject line: ${subject}`)

    const userPrompt = userParts.join('\n\n')

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
      detectedLanguage: detectedLang,
      usedWebContent: !!webContent,
    })
  } catch (e) {
    console.error('[campaigns/generate]', e)
    return error('AI generation failed', 500)
  }
}
