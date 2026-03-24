'use client'

import { useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import Link from 'next/link'
import {
  Send, Sparkles, Loader2, Calendar, Plus, Trash2,
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

type BlockType = 'header' | 'text' | 'button' | 'image' | 'divider' | 'spacer'
interface Block {
  id: string; type: BlockType; content: string; align?: 'left' | 'center'
  bgColor?: string; textColor?: string; btnColor?: string; btnTextColor?: string
  fontSize?: number; bold?: boolean; url?: string; height?: number
}

const defaultBlock = (type: BlockType): Block => {
  const id = crypto.randomUUID()
  switch (type) {
    case 'header': return { id, type, content: 'Tu título principal', align: 'center', bgColor: '#1a1a2e', textColor: '#ffffff', fontSize: 28, bold: true }
    case 'text': return { id, type, content: 'Escribe tu mensaje aquí.', align: 'left', textColor: '#333333', fontSize: 15 }
    case 'button': return { id, type, content: 'Ver oferta', align: 'center', btnColor: '#6366f1', btnTextColor: '#ffffff', url: '#' }
    case 'image': return { id, type, content: 'https://placehold.co/600x200/e2e8f0/94a3b8?text=Imagen', url: '' }
    case 'divider': return { id, type, content: '' }
    case 'spacer': return { id, type, content: '', height: 24 }
  }
}

function blockToHtml(block: Block): string {
  const align = block.align || 'left'
  switch (block.type) {
    case 'header': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${block.bgColor};padding:32px 24px;text-align:${align}"><p style="margin:0;color:${block.textColor};font-size:${block.fontSize}px;font-weight:${block.bold ? '700' : '400'}">${block.content}</p></td></tr></table>`
    case 'text': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 24px;text-align:${align}"><p style="margin:0;color:${block.textColor};font-size:${block.fontSize}px;line-height:1.6">${block.content}</p></td></tr></table>`
    case 'button': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 24px;text-align:${align}"><a href="${block.url}" style="display:inline-block;background:${block.btnColor};color:${block.btnTextColor};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">${block.content}</a></td></tr></table>`
    case 'image': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 0;text-align:center"><img src="${block.content}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto" /></td></tr></table>`
    case 'divider': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 24px"><hr style="border:none;border-top:1px solid #e2e8f0" /></td></tr></table>`
    case 'spacer': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:${block.height}px">&nbsp;</td></tr></table>`
  }
}

function blocksToHtml(blocks: Block[]): string {
  return `<!DOCTYPE html><html><body style="background:#f4f4f4;font-family:sans-serif"><table width="100%"><tr><td align="center"><table width="600" style="background:#fff;border-radius:8px;overflow:hidden">${blocks.map(blockToHtml).join('')}<tr><td style="padding:16px;text-align:center;font-size:12px;color:#94a3b8">Si no deseas recibir más correos, <a href="{{unsubscribe_url}}" style="color:#6366f1">cancela tu suscripción</a>.</td></tr></table></td></tr></table></body></html>`
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: 'header', label: 'Encabezado', icon: <Type className="w-3 h-3" /> },
  { type: 'text', label: 'Texto', icon: <AlignLeft className="w-3 h-3" /> },
  { type: 'button', label: 'Botón', icon: <Square className="w-3 h-3" /> },
  { type: 'image', label: 'Imagen', icon: <Image className="w-3 h-3" /> },
  { type: 'divider', label: 'Divisor', icon: <Minus className="w-3 h-3" /> },
]

function BlockEditor({ block, onChange, onDelete, onMove, isFirst, isLast }: {
  block: Block; onChange: (b: Block) => void; onDelete: () => void
  onMove: (dir: 'up' | 'down') => void; isFirst: boolean; isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          {(block.type === 'text' || block.type === 'header') ? (
            <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent" />
          ) : block.type === 'button' ? (
            <div className="flex gap-2">
              <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1" placeholder="Texto del botón..." />
              <Input value={block.url || ''} onChange={e => onChange({ ...block, url: e.target.value })} className="h-7 text-xs border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1 text-muted-foreground" placeholder="https://..." />
            </div>
          ) : block.type === 'image' ? (
            <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent" placeholder="URL de la imagen..." />
          ) : (<span className="text-xs text-muted-foreground">{block.type}</span>)}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove('up')} disabled={isFirst}><ChevronUp className="w-3 h-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove('down')} disabled={isLast}><ChevronDown className="w-3 h-3" /></Button>
          {(block.type !== 'divider' && block.type !== 'spacer') && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setExpanded(v => !v)}><Code2 className="w-3 h-3" /></Button>}
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={onDelete}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 py-2 border-t bg-background flex flex-wrap gap-3 text-xs">
          {(block.type === 'text' || block.type === 'header') && (
            <>
              <div className="flex items-center gap-1"><Label className="text-xs">Tamaño</Label><Input type="number" value={block.fontSize || 15} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })} className="h-6 w-14 text-xs" /></div>
              <div className="flex items-center gap-1"><Label className="text-xs">Color</Label><input type="color" value={block.textColor || '#333'} onChange={e => onChange({ ...block, textColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>
              {block.type === 'header' && <div className="flex items-center gap-1"><Label className="text-xs">Fondo</Label><input type="color" value={block.bgColor || '#1a1a2e'} onChange={e => onChange({ ...block, bgColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>}
              <div className="flex items-center gap-1"><Switch checked={!!block.bold} onCheckedChange={v => onChange({ ...block, bold: v })} /><Label className="text-xs">Negrita</Label></div>
            </>
          )}
          {block.type === 'button' && (
            <>
              <div className="flex items-center gap-1"><Label className="text-xs">Fondo</Label><input type="color" value={block.btnColor || '#6366f1'} onChange={e => onChange({ ...block, btnColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>
              <div className="flex items-center gap-1"><Label className="text-xs">Texto</Label><input type="color" value={block.btnTextColor || '#fff'} onChange={e => onChange({ ...block, btnTextColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const statusColor: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', scheduled: 'bg-blue-500/10 text-blue-600',
  running: 'bg-yellow-500/10 text-yellow-600', completed: 'bg-green-500/10 text-green-600',
  failed: 'bg-destructive/10 text-destructive', paused: 'bg-orange-500/10 text-orange-600', cancelled: 'bg-muted text-muted-foreground',
}
const statusLabel: Record<string, string> = {
  draft: 'Borrador', scheduled: 'Programada', running: 'Enviando',
  completed: 'Completada', failed: 'Fallida', paused: 'Pausada', cancelled: 'Cancelada',
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data: campaign, isLoading } = useSWR(`/api/campaigns/${id}`, fetcher, { refreshInterval: 8000 })
  const { data: lists } = useSWR('/api/lists?status=ready', fetcher)
  const { data: smtpServers } = useSWR('/api/smtp', fetcher)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [listId, setListId] = useState('')
  const [smtpId, setSmtpId] = useState('')
  const [useAllServers, setUseAllServers] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [editorTab, setEditorTab] = useState<'builder' | 'html' | 'preview'>('html')
  const [rawHtml, setRawHtml] = useState('')
  const [useRawHtml, setUseRawHtml] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([defaultBlock('header'), defaultBlock('text'), defaultBlock('button')])
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiInfo, setAiInfo] = useState<{ lang?: string; usedWeb?: boolean } | null>(null)

  if (campaign && !initialized) {
    setName(campaign.name || ''); setSubject(campaign.subject || '')
    setListId(campaign.list_id || ''); setSmtpId(campaign.smtp_server_id || '')
    setUseAllServers(!campaign.smtp_server_id)
    setScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : '')
    setRawHtml(campaign.html_content || ''); setInitialized(true)
  }

  const getHtmlContent = () => useRawHtml ? rawHtml : blocksToHtml(blocks)
  const updateBlock = useCallback((bid: string, updated: Block) => setBlocks(prev => prev.map(b => b.id === bid ? updated : b)), [])
  const deleteBlock = useCallback((bid: string) => setBlocks(prev => prev.filter(b => b.id !== bid)), [])
  const moveBlock = useCallback((bid: string, dir: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === bid); if (idx < 0) return prev
      const next = [...prev]; const swap = dir === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]]; return next
    })
  }, [])

  const isEditable = campaign && ['draft', 'scheduled'].includes(campaign.status)

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe tu campaña o pega una URL'); return }
    setGenerating(true); setAiInfo(null)
    try {
      const res = await fetch('/api/campaigns/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiPrompt, subject }) })
      const json = await res.json(); if (!res.ok) { toast.error(json.error || 'Error al generar'); return }
      const data = json.data
      if (data?.subject) setSubject(data.subject)
      if (data?.htmlContent) { setRawHtml(data.htmlContent); setUseRawHtml(true); setEditorTab('preview') }
      setAiInfo({ lang: data?.detectedLanguage, usedWeb: data?.usedWebContent }); toast.success('Contenido generado con IA')
    } catch { toast.error('Error al generar') }
    finally { setGenerating(false) }
  }

  const saveCampaign = async () => {
    if (!name.trim()) { toast.error('El nombre es requerido'); return }
    if (!subject.trim()) { toast.error('El asunto es requerido'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, subject, html_content: getHtmlContent(), list_id: listId || null, smtp_server_id: useAllServers ? null : smtpId || null, scheduled_at: scheduledAt || null }) })
      const json = await res.json(); if (!res.ok) { toast.error(json.error || 'Error'); return }
      toast.success('Cambios guardados'); mutate(`/api/campaigns/${id}`)
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const sendCampaign = async () => {
    if (!confirm('¿Enviar esta campaña ahora?')) return
    setSending(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' })
      const json = await res.json(); if (!res.ok) { toast.error(json.error || 'Error'); return }
      toast.success(`Enviando a ${json.data?.totalRecipients?.toLocaleString()} destinatarios`)
      mutate(`/api/campaigns/${id}`)
    } catch { toast.error('Error') }
    finally { setSending(false) }
  }

  const pauseResume = async (action: 'pause' | 'resume') => {
    try {
      await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' })
      toast.success(action === 'pause' ? 'Campaña pausada' : 'Reanudada'); mutate(`/api/campaigns/${id}`)
    } catch { toast.error('Error') }
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  if (!campaign) return <div className="p-6"><p className="text-muted-foreground mb-4">Campaña no encontrada.</p><Link href="/dashboard/campaigns" className="text-primary text-sm">Volver</Link></div>

  const openRate = Number(campaign.sent_count) > 0 ? ((Number(campaign.opened_count) / Number(campaign.sent_count)) * 100).toFixed(1) : '0'
  const clickRate = Number(campaign.sent_count) > 0 ? ((Number(campaign.clicked_count) / Number(campaign.sent_count)) * 100).toFixed(1) : '0'
  const bounceRate = Number(campaign.sent_count) > 0 ? ((Number(campaign.failed_count) / Number(campaign.sent_count)) * 100).toFixed(1) : '0'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/campaigns"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-xl font-bold">{campaign.name}</h1><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusColor[campaign.status])}>{statusLabel[campaign.status] ?? campaign.status}</span></div>
            <p className="text-sm text-muted-foreground">{campaign.subject}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {campaign.status === 'running' && <Button variant="outline" size="sm" onClick={() => pauseResume('pause')}><Pause className="w-4 h-4 mr-1" />Pausar</Button>}
          {campaign.status === 'paused' && <Button variant="outline" size="sm" onClick={() => pauseResume('resume')}><Play className="w-4 h-4 mr-1" />Reanudar</Button>}
          {isEditable && (
            <>
              <Button variant="outline" size="sm" onClick={saveCampaign} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}</Button>
              <Button size="sm" onClick={sendCampaign} disabled={sending}>{sending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Enviar ahora</Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[{ label: 'Enviados', value: Number(campaign.sent_count).toLocaleString('es-CL'), icon: <Send className="w-4 h-4" /> }, { label: 'Abiertos', value: `${openRate}%`, icon: <BarChart2 className="w-4 h-4" /> }, { label: 'Clics', value: `${clickRate}%`, icon: <CheckCircle2 className="w-4 h-4" /> }, { label: 'Fallidos', value: `${bounceRate}%`, icon: <XCircle className="w-4 h-4" /> }].map(s => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3"><div className="text-muted-foreground">{s.icon}</div><div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div></CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Configuración</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label>Nombre</Label><Input value={name} onChange={e => setName(e.target.value)} disabled={!isEditable} /></div>
              <div className="space-y-1"><Label>Asunto</Label><Input value={subject} onChange={e => setSubject(e.target.value)} disabled={!isEditable} /></div>
              <div className="space-y-1">
                <Label>Lista de destinatarios</Label>
                <Select value={listId} onValueChange={setListId} disabled={!isEditable}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{(lists || []).map((l: Record<string, unknown>) => <SelectItem key={l.id as string} value={l.id as string}>{l.name as string}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={useAllServers} onCheckedChange={setUseAllServers} disabled={!isEditable} /><Label className="text-sm">Balancear SMTP</Label></div>
              {!useAllServers && <Select value={smtpId} onValueChange={setSmtpId} disabled={!isEditable}><SelectTrigger><SelectValue placeholder="SMTP..." /></SelectTrigger><SelectContent>{(smtpServers || []).map((s: Record<string, unknown>) => <SelectItem key={s.id as string} value={s.id as string}>{s.name as string}</SelectItem>)}</SelectContent></Select>}
              <div className="space-y-1"><Label>Programar envío</Label><Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} disabled={!isEditable} /></div>
              {!isEditable && <p className="text-xs text-muted-foreground">Esta campaña no se puede editar en estado: {statusLabel[campaign.status]}.</p>}
            </CardContent>
          </Card>

          {isEditable && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Regenerar con IA</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={4} className="text-sm resize-none" placeholder="Describe tu campaña o pega una URL..." />
                {aiInfo && <div className="flex gap-2">{aiInfo.lang && <Badge variant="outline" className="text-xs">{aiInfo.lang.toUpperCase()}</Badge>}{aiInfo.usedWeb && <Badge className="text-xs">Desde web</Badge>}</div>}
                <Button onClick={generateWithAI} disabled={generating} className="w-full">{generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generando...</> : <><Sparkles className="w-4 h-4 mr-2" />Generar con IA</>}</Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Editor */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {[{ key: 'builder', icon: <Type className="w-3.5 h-3.5" />, label: 'Constructor' }, { key: 'html', icon: <Code2 className="w-3.5 h-3.5" />, label: 'HTML' }, { key: 'preview', icon: <Eye className="w-3.5 h-3.5" />, label: 'Preview' }].map(t => (
                <button key={t.key} onClick={() => setEditorTab(t.key as typeof editorTab)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors', editorTab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>{t.icon}{t.label}</button>
              ))}
              {useRawHtml && editorTab === 'builder' && isEditable && <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setUseRawHtml(false); setEditorTab('builder') }}>Volver al constructor</Button>}
            </div>
          </CardHeader>
          <CardContent>
            {editorTab === 'builder' && !useRawHtml && isEditable && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">{BLOCK_TYPES.map(bt => <button key={bt.type} onClick={() => setBlocks(prev => [...prev, defaultBlock(bt.type)])} className="flex items-center gap-1 px-2.5 py-1 rounded-md border bg-muted/40 hover:bg-muted text-xs">{bt.icon}{bt.label}</button>)}</div>
                <div className="space-y-2">
                  {blocks.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Agrega bloques desde arriba</p>}
                  {blocks.map((block, i) => <BlockEditor key={block.id} block={block} onChange={updated => updateBlock(block.id, updated)} onDelete={() => deleteBlock(block.id)} onMove={dir => moveBlock(block.id, dir)} isFirst={i === 0} isLast={i === blocks.length - 1} />)}
                </div>
              </div>
            )}
            {(editorTab === 'html' || useRawHtml) && editorTab !== 'preview' && (
              <div className="space-y-2">
                {!useRawHtml && isEditable && <div className="flex justify-end"><Button size="sm" variant="ghost" className="text-xs" onClick={() => { setRawHtml(blocksToHtml(blocks)); setUseRawHtml(true) }}>Editar HTML</Button></div>}
                <Textarea value={useRawHtml ? rawHtml : blocksToHtml(blocks)} onChange={e => { if (useRawHtml && isEditable) setRawHtml(e.target.value) }} readOnly={!useRawHtml || !isEditable} rows={28} className="font-mono text-xs resize-none" />
              </div>
            )}
            {editorTab === 'preview' && <div className="border rounded-lg overflow-hidden bg-[#f4f4f4]"><iframe srcDoc={getHtmlContent()} className="w-full h-[600px] border-0" title="Email preview" /></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
