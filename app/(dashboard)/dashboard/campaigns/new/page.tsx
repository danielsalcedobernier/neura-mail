'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  Send, Sparkles, Loader2, Calendar, Plus, Trash2,
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
    case 'text': return { id, type, content: 'Escribe tu mensaje aquí. Usa {{first_name}} para personalizar.', align: 'left', textColor: '#333333', fontSize: 15 }
    case 'button': return { id, type, content: 'Ver oferta', align: 'center', btnColor: '#6366f1', btnTextColor: '#ffffff', url: '#' }
    case 'image': return { id, type, content: 'https://placehold.co/600x200/e2e8f0/94a3b8?text=Imagen', url: '' }
    case 'divider': return { id, type, content: '' }
    case 'spacer': return { id, type, content: '', height: 24 }
  }
}

function blockToHtml(block: Block): string {
  const align = block.align || 'left'
  switch (block.type) {
    case 'header': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${block.bgColor||'#1a1a2e'};padding:32px 24px;text-align:${align}"><p style="margin:0;color:${block.textColor||'#fff'};font-size:${block.fontSize||28}px;font-weight:${block.bold?'700':'400'}">${block.content}</p></td></tr></table>`
    case 'text': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 24px;text-align:${align}"><p style="margin:0;color:${block.textColor||'#333'};font-size:${block.fontSize||15}px;font-weight:${block.bold?'700':'400'};line-height:1.6">${block.content}</p></td></tr></table>`
    case 'button': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 24px;text-align:${align}"><a href="${block.url||'#'}" style="display:inline-block;background:${block.btnColor||'#6366f1'};color:${block.btnTextColor||'#fff'};padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">${block.content}</a></td></tr></table>`
    case 'image': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 0;text-align:center"><img src="${block.content}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto" /></td></tr></table>`
    case 'divider': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:8px 24px"><hr style="border:none;border-top:1px solid #e2e8f0" /></td></tr></table>`
    case 'spacer': return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:${block.height||24}px">&nbsp;</td></tr></table>`
  }
}

function blocksToHtml(blocks: Block[]): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email</title></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px">${blocks.map(blockToHtml).join('')}<tr><td style="padding:16px 24px;text-align:center;font-size:12px;color:#94a3b8">Si no deseas recibir más correos, <a href="{{unsubscribe_url}}" style="color:#6366f1">cancela tu suscripción</a>.</td></tr></table></td></tr></table></body></html>`
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
            <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent" placeholder={block.type === 'header' ? 'Título...' : 'Texto...'} />
          ) : block.type === 'button' ? (
            <div className="flex gap-2">
              <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1" placeholder="Texto del botón..." />
              <Input value={block.url || ''} onChange={e => onChange({ ...block, url: e.target.value })} className="h-7 text-xs border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1 text-muted-foreground" placeholder="https://..." />
            </div>
          ) : block.type === 'image' ? (
            <Input value={block.content} onChange={e => onChange({ ...block, content: e.target.value })} className="h-7 text-sm border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent" placeholder="URL de la imagen..." />
          ) : (
            <span className="text-xs text-muted-foreground">{block.type}</span>
          )}
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
              <div className="flex items-center gap-1"><Label className="text-xs">Tamaño</Label><Input type="number" value={block.fontSize || 15} onChange={e => onChange({ ...block, fontSize: Number(e.target.value) })} className="h-6 w-14 text-xs" min={10} max={60} /></div>
              <div className="flex items-center gap-1"><Label className="text-xs">Color texto</Label><input type="color" value={block.textColor || '#333333'} onChange={e => onChange({ ...block, textColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>
              {block.type === 'header' && <div className="flex items-center gap-1"><Label className="text-xs">Fondo</Label><input type="color" value={block.bgColor || '#1a1a2e'} onChange={e => onChange({ ...block, bgColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>}
              <div className="flex items-center gap-1"><Switch checked={!!block.bold} onCheckedChange={v => onChange({ ...block, bold: v })} /><Label className="text-xs">Negrita</Label></div>
            </>
          )}
          {block.type === 'button' && (
            <>
              <div className="flex items-center gap-1"><Label className="text-xs">Fondo</Label><input type="color" value={block.btnColor || '#6366f1'} onChange={e => onChange({ ...block, btnColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>
              <div className="flex items-center gap-1"><Label className="text-xs">Texto</Label><input type="color" value={block.btnTextColor || '#ffffff'} onChange={e => onChange({ ...block, btnTextColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer border border-border" /></div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

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
  const [saving, setSaving] = useState(false)
  const [sendNow, setSendNow] = useState(false)
  const [editorTab, setEditorTab] = useState<'builder' | 'html' | 'preview'>('builder')
  const [rawHtml, setRawHtml] = useState('')
  const [useRawHtml, setUseRawHtml] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([defaultBlock('header'), defaultBlock('text'), defaultBlock('button')])
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiInfo, setAiInfo] = useState<{ lang?: string; usedWeb?: boolean } | null>(null)

  const getHtmlContent = () => useRawHtml ? rawHtml : blocksToHtml(blocks)

  const updateBlock = useCallback((id: string, updated: Block) => setBlocks(prev => prev.map(b => b.id === id ? updated : b)), [])
  const deleteBlock = useCallback((id: string) => setBlocks(prev => prev.filter(b => b.id !== id)), [])
  const moveBlock = useCallback((id: string, dir: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id); if (idx < 0) return prev
      const next = [...prev]; const swap = dir === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]]; return next
    })
  }, [])

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe tu campaña o pega una URL'); return }
    setGenerating(true); setAiInfo(null)
    try {
      const res = await fetch('/api/campaigns/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiPrompt, subject }) })
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

  const saveCampaign = async (send: boolean) => {
    if (!name.trim()) { toast.error('El nombre es requerido'); return }
    if (!subject.trim()) { toast.error('El asunto es requerido'); return }
    const html = getHtmlContent(); if (!html.trim()) { toast.error('El contenido es requerido'); return }
    if (!listId) { toast.error('Selecciona una lista de destinatarios'); return }
    if (!useAllServers && !smtpId) { toast.error('Selecciona un servidor SMTP'); return }
    setSaving(true); setSendNow(send)
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, subject, html_content: html, text_content: '', list_id: listId, smtp_server_id: useAllServers ? null : smtpId, use_all_servers: useAllServers, scheduled_at: scheduledAt || null }) })
      const json = await res.json(); if (!res.ok) { toast.error(json.error || 'Error al guardar'); return }
      const campaignId = json.data?.id
      if (send && campaignId) {
        const sendRes = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
        const sendJson = await sendRes.json()
        if (!sendRes.ok) toast.error(sendJson.error || 'Guardado pero fallo el envío')
        else toast.success(`Enviando a ${sendJson.data?.totalRecipients?.toLocaleString()} destinatarios`)
      } else { toast.success(scheduledAt ? 'Campaña programada' : 'Borrador guardado') }
      router.push('/dashboard/campaigns')
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Nueva Campaña</h1>
        <p className="text-muted-foreground text-sm mt-1">Diseña tu email con el editor visual o genera contenido con IA.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Configuración</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label>Nombre de la campaña</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="space-y-1"><Label>Asunto del email</Label><Input value={subject} onChange={e => setSubject(e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Lista de destinatarios</Label>
                <Select value={listId} onValueChange={setListId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona una lista..." /></SelectTrigger>
                  <SelectContent>{(lists || []).map((l: Record<string, unknown>) => <SelectItem key={l.id as string} value={l.id as string}>{l.name as string} ({Number(l.valid_count).toLocaleString()} válidos)</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={useAllServers} onCheckedChange={setUseAllServers} /><Label className="text-sm">Balancear SMTP</Label></div>
              {!useAllServers && (
                <Select value={smtpId} onValueChange={setSmtpId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona SMTP..." /></SelectTrigger>
                  <SelectContent>{(smtpServers || []).map((s: Record<string, unknown>) => <SelectItem key={s.id as string} value={s.id as string}>{s.name as string}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <div className="space-y-1"><Label>Programar envío (opcional)</Label><Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Generador IA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={5} className="text-sm resize-none" placeholder="Describe tu campaña o pega una URL de tu sitio web..." />
              {aiInfo && (
                <div className="flex gap-2">
                  {aiInfo.lang && <Badge variant="outline" className="text-xs">{aiInfo.lang.toUpperCase()}</Badge>}
                  {aiInfo.usedWeb && <Badge className="text-xs">Desde web</Badge>}
                </div>
              )}
              <Button onClick={generateWithAI} disabled={generating} className="w-full">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generando...</> : <><Sparkles className="w-4 h-4 mr-2" />Generar con IA</>}
              </Button>
              <p className="text-xs text-muted-foreground">Responde en tu idioma. Pega una URL y la IA analizará el sitio.</p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button onClick={() => saveCampaign(true)} disabled={saving} className="w-full">
              {saving && sendNow ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}Enviar ahora
            </Button>
            <Button onClick={() => saveCampaign(false)} disabled={saving} variant="outline" className="w-full">
              {saving && !sendNow ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}{scheduledAt ? 'Programar' : 'Guardar borrador'}
            </Button>
          </div>
        </div>

        {/* Right: Editor */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              {[{ key: 'builder', icon: <Type className="w-3.5 h-3.5" />, label: 'Constructor' }, { key: 'html', icon: <Code2 className="w-3.5 h-3.5" />, label: 'HTML' }, { key: 'preview', icon: <Eye className="w-3.5 h-3.5" />, label: 'Preview' }].map(t => (
                <button key={t.key} onClick={() => setEditorTab(t.key as typeof editorTab)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors', editorTab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>{t.icon}{t.label}</button>
              ))}
              {useRawHtml && editorTab === 'builder' && <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setUseRawHtml(false); setEditorTab('builder') }}>Volver al constructor</Button>}
            </div>
          </CardHeader>
          <CardContent>
            {editorTab === 'builder' && !useRawHtml && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {BLOCK_TYPES.map(bt => (<button key={bt.type} onClick={() => setBlocks(prev => [...prev, defaultBlock(bt.type)])} className="flex items-center gap-1 px-2.5 py-1 rounded-md border bg-muted/40 hover:bg-muted text-xs transition-colors">{bt.icon}{bt.label}</button>))}
                </div>
                <div className="space-y-2">
                  {blocks.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Agrega bloques desde la paleta de arriba</p>}
                  {blocks.map((block, i) => (
                    <BlockEditor key={block.id} block={block} onChange={updated => updateBlock(block.id, updated)} onDelete={() => deleteBlock(block.id)} onMove={dir => moveBlock(block.id, dir)} isFirst={i === 0} isLast={i === blocks.length - 1} />
                  ))}
                </div>
              </div>
            )}
            {(editorTab === 'html' || useRawHtml) && editorTab !== 'preview' && (
              <div className="space-y-2">
                {!useRawHtml && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>HTML generado (solo lectura)</span><Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => { setRawHtml(blocksToHtml(blocks)); setUseRawHtml(true) }}>Editar HTML</Button></div>}
                <Textarea value={useRawHtml ? rawHtml : blocksToHtml(blocks)} onChange={e => { if (useRawHtml) setRawHtml(e.target.value) }} readOnly={!useRawHtml} rows={28} className="font-mono text-xs resize-none" />
              </div>
            )}
            {editorTab === 'preview' && (
              <div className="border rounded-lg overflow-hidden bg-[#f4f4f4]">
                <iframe srcDoc={getHtmlContent()} className="w-full h-[600px] border-0" title="Email preview" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
