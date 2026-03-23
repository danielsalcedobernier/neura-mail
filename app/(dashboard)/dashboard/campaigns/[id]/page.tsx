'use client'

import { useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import Link from 'next/link'
import {
  Send, Sparkles, Loader2, Calendar, Shuffle, Plus, Trash2,
  GripVertical, Type, AlignLeft, Square, Minus, Code2, Eye,
  ChevronDown, ChevronUp, AlignCenter, Globe, ArrowLeft,
  BarChart2, Pause, Play, CheckCircle2, XCircle, Image,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

// ── Block types (same as new/page.tsx) ────────────────────────────────────────
type BlockType = 'header' | 'text' | 'button' | 'image' | 'divider' | 'spacer'
interface Block {
  id: string; type: BlockType; content: string; align?: 'left' | 'center'
  bgColor?: string; textColor?: string; btnColor?: string; btnTextColor?: string
  fontSize?: number; bold?: boolean; url?: string; height?: number
}

const defaultBlock = (type: BlockType): Block => {
  const id = crypto.randomUUID()
  switch (type) {
    case 'header':  return { id, type, content: 'Tu título principal', align: 'center', bgColor: '#1a1a2e', textColor: '#ffffff', fontSize: 28, bold: true }
    case 'text':    return { id, type, content: 'Escribe tu mensaje aquí.', align: 'left', textColor: '#333333', fontSize: 15 }
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
      return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${block.bgColor || '#1a1a2e'}"><tr><td style="padding:36px 40px;text-align:${align}"><h1 style="margin:0;color:${block.textColor || '#ffffff'};font-family:Arial,sans-serif;font-size:${block.fontSize || 28}px;font-weight:${block.bold ? 'bold' : 'normal'};line-height:1.3">${block.content}</h1></td></tr></table>`
    case 'text':
      return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 40px;text-align:${align}"><p style="margin:0;color:${block.textColor || '#333333'};font-family:Arial,sans-serif;font-size:${block.fontSize || 15}px;font-weight:${block.bold ? 'bold' : 'normal'};line-height:1.7">${block.content}</p></td></tr></table>`
    case 'button':
      return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px 40px;text-align:${align}"><a href="${block.url || '#'}" style="display:inline-block;padding:14px 32px;background-color:${block.btnColor || '#6366f1'};color:${block.btnTextColor || '#ffffff'};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;border-radius:6px">${block.content}</a></td></tr></table>`
    case 'image':
      return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0;text-align:center"><img src="${block.content}" alt="" style="max-width:100%;display:block;margin:0 auto" /></td></tr></table>`
    case 'divider':
      return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 40px"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0" /></td></tr></table>`
    case 'spacer':
      return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:${block.height || 24}px;line-height:${block.height || 24}px;font-size:1px">&nbsp;</td></tr></table>`
  }
}

function blocksToHtml(blocks: Block[]): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5"><tr><td style="padding:24px 0"><table width="600" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)"><tr><td>${blocks.map(blockToHtml).join('\n')}<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc"><tr><td style="padding:24px 40px;text-align:center"><p style="margin:0;color:#94a3b8;font-family:Arial,sans-serif;font-size:12px">Si no deseas recibir más correos, <a href="{{unsubscribe_url}}" style="color:#94a3b8">cancela tu suscripción</a>.</p></td></tr></table></td></tr></table></td></tr></table></body></html>`
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: 'header',  label: 'Encabezado', icon: <Type className="w-3.5 h-3.5" /> },
  { type: 'text',    label: 'Texto',      icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { type: 'button',  label: 'Botón',      icon: <Square className="w-3.5 h-3.5" /> },
  { type: 'image',   label: 'Imagen',     icon: <Image className="w-3.5 h-3.5" /> },
  { type: 'divider', label: 'Divisor',    icon: <Minus className="w-3.5 h-3.5" /> },
  { type: 'spacer',  label: 'Espacio',    icon: <ChevronDown className="w-3.5 h-3.5" /> },
]

function BlockEditor({ block, onChange, onDelete, onMove, isFirst, isLast }: {
  block: Block; onChange: (b: Block) => void; onDelete: () => void
  onMove: (dir: 'up' | 'down') => void; isFirst: boolean; isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="group border border-border rounded-lg bg-background hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />
        <div className="flex-1 min-w-0">
          {(block.type === 'text' || block.type === 'header') ? (
            <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })}
              className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent"
              placeholder={block.type === 'header' ? 'Título...' : 'Texto...'} />
          ) : block.type === 'button' ? (
            <div className="flex items-center gap-2">
              <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })}
                className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1" placeholder="Texto del botón..." />
              <Input value={block.url || ''} onChange={e => onChange({ ...block, url: e.target.value })}
                className="h-7 text-xs border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1 text-muted-foreground" placeholder="https://..." />
            </div>
          ) : block.type === 'image' ? (
            <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })}
              className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent" placeholder="URL de la imagen..." />
          ) : (
            <span className="text-xs text-muted-foreground capitalize">{block.type}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMove('up')} disabled={isFirst}><ChevronUp className="w-3 h-3" /></Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMove('down')} disabled={isLast}><ChevronDown className="w-3 h-3" /></Button>
          {(block.type !== 'divider' && block.type !== 'spacer') && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(v => !v)}><AlignCenter className="w-3 h-3" /></Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 py-2 flex flex-wrap gap-3 bg-muted/30">
          {(block.type === 'text' || block.type === 'header') && (
            <>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Tamaño</label>
                <Input type="number" value={block.fontSize || 15} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })} className="h-6 w-14 text-xs" min={10} max={60} />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Color texto</label>
                <input type="color" value={block.textColor || '#333333'} onChange={e => onChange({ ...block, textColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" />
              </div>
              {block.type === 'header' && (
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground">Fondo</label>
                  <input type="color" value={block.bgColor || '#1a1a2e'} onChange={e => onChange({ ...block, bgColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" />
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
                <input type="color" value={block.btnColor || '#6366f1'} onChange={e => onChange({ ...block, btnColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted-foreground">Texto</label>
                <input type="color" value={block.btnTextColor || '#ffffff'} onChange={e => onChange({ ...block, btnTextColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" />
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
              <Input type="number" value={block.height || 24} onChange={e => onChange({ ...block, height: Number(e.target.value) })} className="h-6 w-16 text-xs" min={4} max={120} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Status helpers ────────────────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-500/10 text-blue-600',
  running: 'bg-yellow-500/10 text-yellow-600',
  completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive',
  paused: 'bg-orange-500/10 text-orange-600',
  cancelled: 'bg-muted text-muted-foreground',
}

const statusLabel: Record<string, string> = {
  draft: 'Borrador', scheduled: 'Programada', running: 'Enviando',
  completed: 'Completada', failed: 'Fallida', paused: 'Pausada', cancelled: 'Cancelada',
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: campaign, isLoading } = useSWR(`/api/campaigns/${id}`, fetcher, { refreshInterval: 8000 })
  const { data: lists }       = useSWR('/api/lists?status=ready', fetcher)
  const { data: smtpServers } = useSWR('/api/smtp', fetcher)

  const [name, setName]             = useState('')
  const [subject, setSubject]       = useState('')
  const [listId, setListId]         = useState('')
  const [smtpId, setSmtpId]         = useState('')
  const [useAllServers, setUseAllServers] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving]         = useState(false)
  const [sending, setSending]       = useState(false)
  const [editorTab, setEditorTab]   = useState<'builder' | 'html' | 'preview'>('html')
  const [rawHtml, setRawHtml]       = useState('')
  const [useRawHtml, setUseRawHtml] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const [aiPrompt, setAiPrompt]     = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiInfo, setAiInfo]         = useState<{ lang?: string; usedWeb?: boolean } | null>(null)

  // Initialize form once campaign data loads
  if (campaign && !initialized) {
    setName(campaign.name || '')
    setSubject(campaign.subject || '')
    setListId(campaign.list_id || '')
    setSmtpId(campaign.smtp_server_id || '')
    setUseAllServers(!campaign.smtp_server_id)
    setScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : '')
    setRawHtml(campaign.html_content || '')
    setInitialized(true)
  }

  const [blocks, setBlocks] = useState<Block[]>([defaultBlock('header'), defaultBlock('text'), defaultBlock('button')])

  const getHtmlContent = () => useRawHtml ? rawHtml : blocksToHtml(blocks)

  const updateBlock = useCallback((bid: string, updated: Block) => setBlocks(prev => prev.map(b => b.id === bid ? updated : b)), [])
  const deleteBlock = useCallback((bid: string) => setBlocks(prev => prev.filter(b => b.id !== bid)), [])
  const moveBlock   = useCallback((bid: string, dir: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === bid)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = dir === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }, [])

  const isEditable = campaign && ['draft', 'scheduled'].includes(campaign.status)

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe tu campaña o pega una URL'); return }
    setGenerating(true); setAiInfo(null)
    try {
      const res = await fetch('/api/campaigns/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, subject }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al generar'); return }
      const data = json.data
      if (data?.subject) setSubject(data.subject)
      if (data?.htmlContent) { setRawHtml(data.htmlContent); setUseRawHtml(true); setEditorTab('preview') }
      setAiInfo({ lang: data?.detectedLanguage, usedWeb: data?.usedWebContent })
      toast.success(data?.usedWebContent ? 'Campaña generada desde tu web!' : 'Contenido generado con IA')
    } catch { toast.error('Error al generar') }
    finally { setGenerating(false) }
  }

  const saveCampaign = async () => {
    if (!name.trim()) { toast.error('El nombre es requerido'); return }
    if (!subject.trim()) { toast.error('El asunto es requerido'); return }
    const html = getHtmlContent()
    if (!html.trim()) { toast.error('El contenido es requerido'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, subject, html_content: html,
          list_id: listId || null,
          smtp_server_id: useAllServers ? null : smtpId || null,
          scheduled_at: scheduledAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al guardar'); return }
      toast.success('Cambios guardados')
      mutate(`/api/campaigns/${id}`)
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const sendCampaign = async () => {
    if (!confirm('¿Enviar esta campaña ahora?')) return
    setSending(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Error al enviar'); return }
      toast.success(`Enviando a ${json.data?.totalRecipients?.toLocaleString()} destinatarios`)
      mutate(`/api/campaigns/${id}`)
    } catch { toast.error('Error al enviar') }
    finally { setSending(false) }
  }

  const pauseResume = async (action: 'pause' | 'resume') => {
    try {
      await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' })
      toast.success(action === 'pause' ? 'Campaña pausada' : 'Campaña reanudada')
      mutate(`/api/campaigns/${id}`)
    } catch { toast.error('Error') }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )

  if (!campaign) return (
    <div className="p-6">
      <p className="text-sm text-muted-foreground">Campaña no encontrada.</p>
      <Link href="/dashboard/campaigns"><Button variant="outline" size="sm" className="mt-3"><ArrowLeft className="w-4 h-4 mr-1.5" /> Volver</Button></Link>
    </div>
  )

  const openRate   = Number(campaign.sent_count) > 0 ? ((Number(campaign.opened_count)  / Number(campaign.sent_count)) * 100).toFixed(1) : '0'
  const clickRate  = Number(campaign.sent_count) > 0 ? ((Number(campaign.clicked_count) / Number(campaign.sent_count)) * 100).toFixed(1) : '0'
  const bounceRate = Number(campaign.sent_count) > 0 ? ((Number(campaign.failed_count)  / Number(campaign.sent_count)) * 100).toFixed(1) : '0'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/campaigns">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground truncate">{campaign.name}</h1>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', statusColor[campaign.status])}>
              {statusLabel[campaign.status] ?? campaign.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{campaign.subject}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {campaign.status === 'running' && (
            <Button size="sm" variant="outline" onClick={() => pauseResume('pause')}>
              <Pause className="w-3.5 h-3.5 mr-1.5" /> Pausar
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button size="sm" variant="outline" onClick={() => pauseResume('resume')}>
              <Play className="w-3.5 h-3.5 mr-1.5" /> Reanudar
            </Button>
          )}
          {isEditable && (
            <>
              <Button size="sm" variant="outline" onClick={saveCampaign} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Guardar'}
              </Button>
              <Button size="sm" onClick={sendCampaign} disabled={sending}>
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                Enviar ahora
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Enviados',  value: Number(campaign.sent_count).toLocaleString('es-CL'),    icon: <Send className="w-4 h-4 text-primary" /> },
          { label: 'Abiertos',  value: `${openRate}%`,   icon: <BarChart2 className="w-4 h-4 text-blue-500" /> },
          { label: 'Clics',     value: `${clickRate}%`,  icon: <CheckCircle2 className="w-4 h-4 text-green-500" /> },
          { label: 'Fallidos',  value: `${bounceRate}%`, icon: <XCircle className="w-4 h-4 text-destructive" /> },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              {s.icon}
              <div>
                <p className="text-lg font-semibold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Settings */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Configuración</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Nombre</Label>
                <Input value={name} onChange={e => setName(e.target.value)} disabled={!isEditable} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Asunto</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} disabled={!isEditable} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Lista de destinatarios</Label>
                <Select value={listId} onValueChange={setListId} disabled={!isEditable}>
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
                  <Switch checked={useAllServers} onCheckedChange={setUseAllServers} disabled={!isEditable} />
                </div>
                {!useAllServers && (
                  <Select value={smtpId} onValueChange={setSmtpId} disabled={!isEditable}>
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
                <Label>Programar envío</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} disabled={!isEditable} />
              </div>
              {!isEditable && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  Esta campaña no se puede editar en su estado actual ({statusLabel[campaign.status]}).
                </p>
              )}
            </CardContent>
          </Card>

          {/* AI Generator — only show if editable */}
          {isEditable && (
            <Card className="border-primary/20 bg-gradient-to-b from-primary/5 to-background">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> Regenerar con IA
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Textarea
                  placeholder={`Describe una nueva versión o pega una URL:\n• "Campaña más urgente con oferta limitada"\n• "https://mitienda.cl — campaña navideña"`}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  rows={4}
                  className="text-sm resize-none"
                />
                {aiInfo && (
                  <div className="flex flex-wrap gap-1.5">
                    {aiInfo.lang && <Badge variant="secondary" className="text-xs">{aiInfo.lang.toUpperCase()}</Badge>}
                    {aiInfo.usedWeb && <Badge variant="secondary" className="text-xs gap-1"><Globe className="w-3 h-3" /> Desde web</Badge>}
                  </div>
                )}
                <Button onClick={generateWithAI} disabled={generating} size="sm" className="w-full">
                  {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Generando...</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Generar con IA</>}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Editor */}
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
                    <button key={t.key} onClick={() => setEditorTab(t.key as typeof editorTab)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        editorTab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                {useRawHtml && editorTab === 'builder' && isEditable && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { setUseRawHtml(false); setEditorTab('builder') }}>
                    <GripVertical className="w-3 h-3" /> Volver al constructor
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {editorTab === 'builder' && !useRawHtml && isEditable && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
                    {BLOCK_TYPES.map(bt => (
                      <button key={bt.type} onClick={() => setBlocks(prev => [...prev, defaultBlock(bt.type)])}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors">
                        {bt.icon} <Plus className="w-2.5 h-2.5" /> {bt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5 min-h-[400px]">
                    {blocks.length === 0 && (
                      <div className="flex items-center justify-center h-40 border-2 border-dashed border-border rounded-lg">
                        <p className="text-sm text-muted-foreground">Agrega bloques desde la paleta de arriba</p>
                      </div>
                    )}
                    {blocks.map((block, i) => (
                      <BlockEditor key={block.id} block={block}
                        onChange={updated => updateBlock(block.id, updated)}
                        onDelete={() => deleteBlock(block.id)}
                        onMove={dir => moveBlock(block.id, dir)}
                        isFirst={i === 0} isLast={i === blocks.length - 1} />
                    ))}
                  </div>
                </div>
              )}
              {(editorTab === 'html' || useRawHtml) && editorTab !== 'preview' && (
                <div className="flex flex-col gap-2">
                  {!useRawHtml && isEditable && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">HTML generado por el constructor.</p>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setRawHtml(blocksToHtml(blocks)); setUseRawHtml(true) }}>
                        <Code2 className="w-3 h-3 mr-1" /> Editar HTML
                      </Button>
                    </div>
                  )}
                  <Textarea
                    value={useRawHtml ? rawHtml : blocksToHtml(blocks)}
                    onChange={e => { if (useRawHtml && isEditable) setRawHtml(e.target.value) }}
                    readOnly={!useRawHtml || !isEditable}
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
                      .replace(/\{\{unsubscribe_url\}\}/g, '#')}
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
