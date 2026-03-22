'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  Send, Sparkles, Loader2, Calendar, Shuffle, Plus, Trash2,
  GripVertical, Type, Image, Square, Minus, Code2, Eye,
  Link2, Globe, ChevronDown, ChevronUp, AlignLeft, AlignCenter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

// ── Block types ───────────────────────────────────────────────────────────────
type BlockType = 'header' | 'text' | 'button' | 'image' | 'divider' | 'spacer'

interface Block {
  id: string
  type: BlockType
  content: string
  align?: 'left' | 'center'
  bgColor?: string
  textColor?: string
  btnColor?: string
  btnTextColor?: string
  fontSize?: number
  bold?: boolean
  url?: string
  height?: number
}

const defaultBlock = (type: BlockType): Block => {
  const id = crypto.randomUUID()
  switch (type) {
    case 'header':  return { id, type, content: 'Tu título principal', align: 'center', bgColor: '#1a1a2e', textColor: '#ffffff', fontSize: 28, bold: true }
    case 'text':    return { id, type, content: 'Escribe tu mensaje aquí. Usa {{first_name}} para personalizar.', align: 'left', textColor: '#333333', fontSize: 15 }
    case 'button':  return { id, type, content: 'Ver oferta', align: 'center', btnColor: '#6366f1', btnTextColor: '#ffffff', url: '#' }
    case 'image':   return { id, type, content: 'https://placehold.co/600x200/e2e8f0/94a3b8?text=Imagen', url: '' }
    case 'divider': return { id, type, content: '' }
    case 'spacer':  return { id, type, content: '', height: 24 }
  }
}

function blockToHtml(block: Block): string {
  const align = block.align || 'left'
  switch (block.type) {
    case 'header':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${block.bgColor || '#1a1a2e'}">
  <tr><td style="padding:36px 40px;text-align:${align}">
    <h1 style="margin:0;color:${block.textColor || '#ffffff'};font-family:Arial,sans-serif;font-size:${block.fontSize || 28}px;font-weight:${block.bold ? 'bold' : 'normal'};line-height:1.3">${block.content}</h1>
  </td></tr>
</table>`
    case 'text':
      return `<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:16px 40px;text-align:${align}">
    <p style="margin:0;color:${block.textColor || '#333333'};font-family:Arial,sans-serif;font-size:${block.fontSize || 15}px;font-weight:${block.bold ? 'bold' : 'normal'};line-height:1.7">${block.content}</p>
  </td></tr>
</table>`
    case 'button':
      return `<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:20px 40px;text-align:${align}">
    <a href="${block.url || '#'}" style="display:inline-block;padding:14px 32px;background-color:${block.btnColor || '#6366f1'};color:${block.btnTextColor || '#ffffff'};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px">${block.content}</a>
  </td></tr>
</table>`
    case 'image':
      return `<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:0;text-align:center">
    <img src="${block.content}" alt="" style="max-width:100%;display:block;margin:0 auto" />
  </td></tr>
</table>`
    case 'divider':
      return `<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:8px 40px">
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0" />
  </td></tr>
</table>`
    case 'spacer':
      return `<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="height:${block.height || 24}px;line-height:${block.height || 24}px;font-size:1px">&nbsp;</td></tr>
</table>`
  }
}

function blocksToHtml(blocks: Block[]): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5">
<tr><td style="padding:24px 0">
<table width="600" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<tr><td>
${blocks.map(blockToHtml).join('\n')}
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc">
<tr><td style="padding:24px 40px;text-align:center">
<p style="margin:0;color:#94a3b8;font-family:Arial,sans-serif;font-size:12px">
Si no deseas recibir más correos, <a href="{{unsubscribe_url}}" style="color:#94a3b8">cancela tu suscripción</a>.
</p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// ── Block palette ─────────────────────────────────────────────────────────────
const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: 'header',  label: 'Encabezado', icon: <Type className="w-3.5 h-3.5" /> },
  { type: 'text',    label: 'Texto',      icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { type: 'button',  label: 'Botón',      icon: <Square className="w-3.5 h-3.5" /> },
  { type: 'image',   label: 'Imagen',     icon: <Image className="w-3.5 h-3.5" /> },
  { type: 'divider', label: 'Divisor',    icon: <Minus className="w-3.5 h-3.5" /> },
  { type: 'spacer',  label: 'Espacio',    icon: <ChevronDown className="w-3.5 h-3.5" /> },
]

// ── Block editor component ────────────────────────────────────────────────────
function BlockEditor({ block, onChange, onDelete, onMove, isFirst, isLast }: {
  block: Block
  onChange: (b: Block) => void
  onDelete: () => void
  onMove: (dir: 'up' | 'down') => void
  isFirst: boolean
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group border border-border rounded-lg bg-background hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />
        <div className="flex-1 min-w-0">
          {block.type === 'text' || block.type === 'header' ? (
            <Input
              value={block.content}
              onChange={e => onChange({ ...block, content: e.target.value })}
              className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
              placeholder={block.type === 'header' ? 'Título...' : 'Texto...'}
            />
          ) : block.type === 'button' ? (
            <div className="flex items-center gap-2">
              <Input
                value={block.content}
                onChange={e => onChange({ ...block, content: e.target.value })}
                className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1"
                placeholder="Texto del botón..."
              />
              <Input
                value={block.url || ''}
                onChange={e => onChange({ ...block, url: e.target.value })}
                className="h-7 text-xs border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1 text-muted-foreground"
                placeholder="https://..."
              />
            </div>
          ) : block.type === 'image' ? (
            <Input
              value={block.content}
              onChange={e => onChange({ ...block, content: e.target.value })}
              className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
              placeholder="URL de la imagen..."
            />
          ) : (
            <span className="text-xs text-muted-foreground capitalize">{block.type}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMove('up')} disabled={isFirst}>
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMove('down')} disabled={isLast}>
            <ChevronDown className="w-3 h-3" />
          </Button>
          {(block.type !== 'divider' && block.type !== 'spacer') && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(v => !v)}>
              <AlignCenter className="w-3 h-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Options panel */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 flex flex-wrap gap-3 bg-muted/30">
          {(block.type === 'text' || block.type === 'header') && (
            <>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Tamaño</label>
                <Input type="number" value={block.fontSize || 15} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })}
                  className="h-6 w-14 text-xs" min={10} max={60} />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Color texto</label>
                <input type="color" value={block.textColor || '#333333'} onChange={e => onChange({ ...block, textColor: e.target.value })}
                  className="h-6 w-8 rounded cursor-pointer border border-border" />
              </div>
              {block.type === 'header' && (
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground">Fondo</label>
                  <input type="color" value={block.bgColor || '#1a1a2e'} onChange={e => onChange({ ...block, bgColor: e.target.value })}
                    className="h-6 w-8 rounded cursor-pointer border border-border" />
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Alinear</label>
                <Select value={block.align || 'left'} onValueChange={v => onChange({ ...block, align: v as 'left' | 'center' })}>
                  <SelectTrigger className="h-6 text-xs w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Izquierda</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch checked={!!block.bold} onCheckedChange={v => onChange({ ...block, bold: v })} />
                <label className="text-xs text-muted-foreground">Negrita</label>
              </div>
            </>
          )}
          {block.type === 'button' && (
            <>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Fondo</label>
                <input type="color" value={block.btnColor || '#6366f1'} onChange={e => onChange({ ...block, btnColor: e.target.value })}
                  className="h-6 w-8 rounded cursor-pointer border border-border" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Texto</label>
                <input type="color" value={block.btnTextColor || '#ffffff'} onChange={e => onChange({ ...block, btnTextColor: e.target.value })}
                  className="h-6 w-8 rounded cursor-pointer border border-border" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Alinear</label>
                <Select value={block.align || 'center'} onValueChange={v => onChange({ ...block, align: v as 'left' | 'center' })}>
                  <SelectTrigger className="h-6 text-xs w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Izquierda</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {block.type === 'spacer' && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Alto (px)</label>
              <Input type="number" value={block.height || 24} onChange={e => onChange({ ...block, height: Number(e.target.value) })}
                className="h-6 w-16 text-xs" min={4} max={120} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NewCampaignPage() {
  const router = useRouter()
  const { data: lists } = useSWR('/api/lists?status=ready', fetcher)
  const { data: smtpServers } = useSWR('/api/smtp', fetcher)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [listId, setListId] = useState('')
  const [smtpId, setSmtpId] = useState('')
  const [useAllServers, setUseAllServers] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [sendNow, setSendNow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editorTab, setEditorTab] = useState<'builder' | 'html' | 'preview'>('builder')
  const [rawHtml, setRawHtml] = useState('')
  const [useRawHtml, setUseRawHtml] = useState(false)

  // Builder blocks
  const [blocks, setBlocks] = useState<Block[]>([
    defaultBlock('header'),
    defaultBlock('text'),
    defaultBlock('button'),
  ])

  // AI generation
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiInfo, setAiInfo] = useState<{ lang?: string; usedWeb?: boolean } | null>(null)

  const getHtmlContent = () => useRawHtml ? rawHtml : blocksToHtml(blocks)

  const updateBlock = useCallback((id: string, updated: Block) => {
    setBlocks(prev => prev.map(b => b.id === id ? updated : b))
  }, [])

  const deleteBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id))
  }, [])

  const moveBlock = useCallback((id: string, dir: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = dir === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }, [])

  const addBlock = (type: BlockType) => {
    setBlocks(prev => [...prev, defaultBlock(type)])
  }

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe tu campaña o pega una URL'); return }
    setGenerating(true)
    setAiInfo(null)
    try {
      const res = await fetch('/api/campaigns/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': navigator.language || 'es',
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          subject,
          language: navigator.language?.split('-')[0] || 'es',
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al generar'); return }
      const data = json.data
      if (data?.subject) setSubject(data.subject)
      if (data?.htmlContent) {
        setRawHtml(data.htmlContent)
        setUseRawHtml(true)
        setEditorTab('preview')
      }
      setAiInfo({ lang: data?.detectedLanguage, usedWeb: data?.usedWebContent })
      toast.success(data?.usedWebContent ? 'Campaña generada desde tu web!' : 'Contenido generado con IA')
    } catch { toast.error('Error al generar') }
    finally { setGenerating(false) }
  }

  const saveCampaign = async (send: boolean) => {
    if (!name.trim()) { toast.error('El nombre es requerido'); return }
    if (!subject.trim()) { toast.error('El asunto es requerido'); return }
    const html = getHtmlContent()
    if (!html.trim()) { toast.error('El contenido es requerido'); return }
    if (!listId) { toast.error('Selecciona una lista de destinatarios'); return }
    if (!useAllServers && !smtpId) { toast.error('Selecciona un servidor SMTP'); return }
    setSaving(true); setSendNow(send)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, subject, html_content: html, text_content: '',
          list_id: listId,
          smtp_server_id: useAllServers ? null : smtpId,
          use_all_servers: useAllServers,
          scheduled_at: scheduledAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al guardar'); return }
      const campaignId = json.data?.id
      if (send && campaignId) {
        const sendRes = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
        const sendJson = await sendRes.json()
        if (!sendRes.ok) toast.error(sendJson.error || 'Guardado pero fallo el envío')
        else toast.success(`Enviando a ${sendJson.data?.totalRecipients?.toLocaleString()} destinatarios`)
      } else {
        toast.success(scheduledAt ? 'Campaña programada' : 'Borrador guardado')
      }
      router.push('/dashboard/campaigns')
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Nueva Campaña</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Diseña tu email con el editor visual o genera contenido con IA.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left column ── */}
        <div className="flex flex-col gap-4">

          {/* Settings */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Configuración</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Nombre de la campaña</Label>
                <Input placeholder="Newsletter Verano 2025" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Asunto del email</Label>
                <Input placeholder="¡No te pierdas nuestra oferta!" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Lista de destinatarios</Label>
                <Select value={listId} onValueChange={setListId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar lista..." /></SelectTrigger>
                  <SelectContent>
                    {(lists || []).map((l: Record<string, unknown>) => (
                      <SelectItem key={l.id as string} value={l.id as string}>
                        {l.name as string} ({Number(l.valid_count).toLocaleString()} válidos)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <Shuffle className="w-3.5 h-3.5 text-primary" /> Balancear SMTP
                  </Label>
                  <Switch checked={useAllServers} onCheckedChange={setUseAllServers} />
                </div>
                {!useAllServers && (
                  <Select value={smtpId} onValueChange={setSmtpId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar servidor..." /></SelectTrigger>
                    <SelectContent>
                      {(smtpServers || []).map((s: Record<string, unknown>) => (
                        <SelectItem key={s.id as string} value={s.id as string}>{s.name as string}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Programar envío (opcional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* AI Generator */}
          <Card className="border-primary/20 bg-gradient-to-b from-primary/5 to-background">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Generador IA
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                placeholder={`Describe tu campaña o pega una URL:\n\n• "Campaña de verano con 30% de descuento"\n• "https://mitienda.cl — campaña de navidad"\n• "Revisar esta web y proponer campaña: https://..."`}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={5}
                className="text-sm resize-none"
              />
              {aiInfo && (
                <div className="flex flex-wrap gap-1.5">
                  {aiInfo.lang && <Badge variant="secondary" className="text-xs">{aiInfo.lang.toUpperCase()}</Badge>}
                  {aiInfo.usedWeb && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Globe className="w-3 h-3" /> Desde web
                    </Badge>
                  )}
                </div>
              )}
              <Button onClick={generateWithAI} disabled={generating} size="sm" className="w-full">
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Generando...</>
                  : <><Sparkles className="w-4 h-4 mr-1.5" /> Generar con IA</>
                }
              </Button>
              <p className="text-xs text-muted-foreground">
                Responde en tu idioma. Pega una URL y la IA analizará el sitio para proponer la campaña.
              </p>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button onClick={() => saveCampaign(true)} disabled={saving} className="w-full">
              {saving && sendNow ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
              Enviar ahora
            </Button>
            <Button onClick={() => saveCampaign(false)} disabled={saving} variant="outline" className="w-full">
              {saving && !sendNow ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
              {scheduledAt ? 'Programar' : 'Guardar borrador'}
            </Button>
          </div>
        </div>

        {/* ── Right column: Editor ── */}
        <div className="lg:col-span-2 flex flex-col gap-0">
          <Card className="flex-1">
            <CardHeader className="pb-0 pt-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {[
                    { key: 'builder', icon: <GripVertical className="w-3.5 h-3.5" />, label: 'Constructor' },
                    { key: 'html',    icon: <Code2 className="w-3.5 h-3.5" />,        label: 'HTML' },
                    { key: 'preview', icon: <Eye className="w-3.5 h-3.5" />,           label: 'Preview' },
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setEditorTab(t.key as typeof editorTab)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        editorTab === t.key
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                {editorTab === 'builder' && !useRawHtml && (
                  <p className="text-xs text-muted-foreground">Arrastra bloques para reordenar</p>
                )}
                {useRawHtml && editorTab === 'builder' && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { setUseRawHtml(false); setEditorTab('builder') }}>
                    <GripVertical className="w-3 h-3" /> Volver al constructor
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4">
              {editorTab === 'builder' && !useRawHtml && (
                <div className="flex flex-col gap-2">
                  {/* Block palette */}
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
                    {BLOCK_TYPES.map(bt => (
                      <button
                        key={bt.type}
                        onClick={() => addBlock(bt.type)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors"
                      >
                        {bt.icon} <Plus className="w-2.5 h-2.5" /> {bt.label}
                      </button>
                    ))}
                  </div>

                  {/* Blocks list */}
                  <div className="flex flex-col gap-1.5 min-h-[400px]">
                    {blocks.length === 0 && (
                      <div className="flex items-center justify-center h-40 border-2 border-dashed border-border rounded-lg">
                        <p className="text-sm text-muted-foreground">Agrega bloques desde la paleta de arriba</p>
                      </div>
                    )}
                    {blocks.map((block, i) => (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        onChange={updated => updateBlock(block.id, updated)}
                        onDelete={() => deleteBlock(block.id)}
                        onMove={dir => moveBlock(block.id, dir)}
                        isFirst={i === 0}
                        isLast={i === blocks.length - 1}
                      />
                    ))}
                  </div>
                </div>
              )}

              {(editorTab === 'html' || useRawHtml) && editorTab !== 'preview' && (
                <div className="flex flex-col gap-2">
                  {!useRawHtml && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Vista del HTML generado (solo lectura). Activa el editor HTML para modificar.</p>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setRawHtml(blocksToHtml(blocks)); setUseRawHtml(true) }}>
                        <Code2 className="w-3 h-3 mr-1" /> Editar HTML
                      </Button>
                    </div>
                  )}
                  <Textarea
                    value={useRawHtml ? rawHtml : blocksToHtml(blocks)}
                    onChange={e => { if (useRawHtml) setRawHtml(e.target.value) }}
                    readOnly={!useRawHtml}
                    rows={28}
                    className="font-mono text-xs resize-none"
                  />
                </div>
              )}

              {editorTab === 'preview' && (
                <div className="border border-border rounded-lg overflow-hidden" style={{ height: 580 }}>
                  <iframe
                    srcDoc={getHtmlContent()
                      .replace(/\{\{first_name\}\}/g, 'Juan')
                      .replace(/\{\{last_name\}\}/g, 'Pérez')
                      .replace(/\{\{email\}\}/g, 'juan@ejemplo.cl')
                      .replace(/\{\{unsubscribe_url\}\}/g, '#')
                    }
                    className="w-full h-full"
                    sandbox="allow-same-origin"
                    title="Vista previa del email"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
