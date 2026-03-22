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

    // Language: explicit from body takes priority, then Accept-Language header, then 'es'
    const acceptLang = request.headers.get('accept-language') || ''
    const headerLang = acceptLang.split(',')[0]?.split('-')[0]?.toLowerCase() || 'es'
    // parsed.data.language comes from the client (navigator.language) — always trust it
    const detectedLang = parsed.data.language || headerLang || 'es'

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
      es: 'español', en: 'English', pt: 'português', fr: 'français',
      de: 'Deutsch', it: 'italiano', nl: 'Nederlands',
    }
    const langName = langNames[detectedLang] || detectedLang

    const systemPrompt = `Eres un experto en email marketing. Escribe campañas de email persuasivas y con buen diseño.

⚠️ REGLA ABSOLUTA: Debes responder ÚNICAMENTE en ${langName} (código: ${detectedLang}). 
Todo el contenido —asunto, cuerpo, botones, pie de página— debe estar en ${langName}.
NO uses ningún otro idioma bajo ninguna circunstancia.

Retorna un objeto JSON con exactamente estos campos:
- subject: string (asunto del email, máx 70 caracteres, en ${langName})
- previewText: string (texto de preview/snippet, máx 140 caracteres, en ${langName})
- htmlContent: string (HTML completo del email con estilos inline — ver requisitos abajo)
- textContent: string (versión en texto plano, en ${langName})

REQUISITOS DEL HTML:
- Layout de una columna, max-width 600px, centrado
- Header con fondo de color sólido y titular grande
- Jerarquía clara: titular → cuerpo → botón CTA
- Botón CTA con estilos inline: background-color, color, padding, border-radius, text-decoration:none, display:inline-block
- Fuentes web-safe (Arial, Georgia) con line-height apropiado
- Footer con placeholder de baja: <a href="{{unsubscribe_url}}">Cancelar suscripción</a>
- TODOS los estilos deben ser inline (sin etiquetas <style>) para compatibilidad con clientes de email
- Usa {{first_name}} para personalización
- Diseño visualmente atractivo con espaciado generoso y colores apropiados para el tono ${tone}`

    const userParts: string[] = []
    userParts.push(`IMPORTANTE: Tu respuesta debe estar completamente en ${langName}. Todo el contenido del email debe estar en ${langName}.`)
    if (webContent) {
      userParts.push(`Quiero crear una campaña basada en el contenido de este sitio web:\n\n${webContent}`)
    }
    userParts.push(cleanPrompt || 'Crea una campaña de email atractiva basada en el contenido del sitio web de arriba.')
    if (subject) userParts.push(`Asunto deseado: ${subject}`)

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
