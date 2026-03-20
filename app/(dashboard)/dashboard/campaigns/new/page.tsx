'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Send, Sparkles, Loader2, Calendar, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

export default function NewCampaignPage() {
  const router = useRouter()
  const { data: lists } = useSWR('/api/lists?status=ready', fetcher)
  const { data: smtpServers } = useSWR('/api/smtp', fetcher)

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [textContent, setTextContent] = useState('')
  const [listId, setListId] = useState('')
  const [smtpId, setSmtpId] = useState('')
  const [useAllServers, setUseAllServers] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [sendNow, setSendNow] = useState(false)
  const [saving, setSaving] = useState(false)

  // AI generation
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) { toast.error('Describe your campaign'); return }
    setGenerating(true)
    try {
      const res = await fetch('/api/campaigns/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, subject }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'AI generation failed'); return }
      if (json.data?.subject) setSubject(json.data.subject)
      if (json.data?.htmlContent) setHtmlContent(json.data.htmlContent)
      if (json.data?.textContent) setTextContent(json.data.textContent)
      toast.success('Campaign content generated!')
    } catch { toast.error('AI generation failed') }
    finally { setGenerating(false) }
  }

  const saveCampaign = async (send: boolean) => {
    if (!name.trim()) { toast.error('Campaign name is required'); return }
    if (!subject.trim()) { toast.error('Subject line is required'); return }
    if (!htmlContent.trim() && !textContent.trim()) { toast.error('Email content is required'); return }
    if (!listId) { toast.error('Select a recipient list'); return }
    if (!useAllServers && !smtpId) { toast.error('Select an SMTP server or enable the balancer'); return }
    setSaving(true)
    setSendNow(send)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, subject, html_content: htmlContent, text_content: textContent,
          list_id: listId,
          smtp_server_id: useAllServers ? null : smtpId,
          use_all_servers: useAllServers,
          scheduled_at: scheduledAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Save failed'); return }
      const campaignId = json.data?.id
      if (send && campaignId) {
        const sendRes = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
        const sendJson = await sendRes.json()
        if (!sendRes.ok) toast.error(sendJson.error || 'Campaign saved but send failed')
        else toast.success(`Campaign is sending to ${sendJson.data?.totalRecipients?.toLocaleString()} recipients!`)
      } else {
        toast.success(scheduledAt ? 'Campaign scheduled!' : 'Campaign saved as draft')
      }
      router.push('/dashboard/campaigns')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">New Campaign</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Build your email campaign manually or with AI assistance.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Settings */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Campaign Settings</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Campaign Name</Label>
                <Input placeholder="Summer Newsletter 2025" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Subject Line</Label>
                <Input placeholder="Don't miss our biggest sale ever!" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Recipient List</Label>
                <Select value={listId} onValueChange={setListId}>
                  <SelectTrigger><SelectValue placeholder="Select list..." /></SelectTrigger>
                  <SelectContent>
                    {(lists || []).map((l: Record<string, unknown>) => (
                      <SelectItem key={l.id as string} value={l.id as string}>
                        {l.name as string} ({Number(l.valid_count).toLocaleString()} valid)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* SMTP — balancer or single server */}
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label className="flex items-center gap-1.5 cursor-pointer">
                      <Shuffle className="w-3.5 h-3.5 text-primary" />
                      Balancear entre todos los SMTP
                    </Label>
                    <p className="text-xs text-muted-foreground">Distribuye el envío proporcionalmente según la capacidad de cada servidor.</p>
                  </div>
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
                {useAllServers && (smtpServers || []).length > 0 && (
                  <p className="text-xs text-primary/80">
                    {(smtpServers || []).length} servidor{(smtpServers || []).length !== 1 ? 'es' : ''} activo{(smtpServers || []).length !== 1 ? 's' : ''} disponible{(smtpServers || []).length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Schedule (optional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* AI */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> AI Content Generator
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                placeholder="Describe your campaign... e.g. 'A promotional email for our summer sale with 30% discount on all products'"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={4}
              />
              <Button onClick={generateWithAI} disabled={generating} size="sm" className="w-full">
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                Generate Content
              </Button>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button onClick={() => saveCampaign(true)} disabled={saving} className="w-full">
              {saving && sendNow ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Send className="w-4 h-4 mr-1.5" />}
              Send Now
            </Button>
            <Button onClick={() => saveCampaign(false)} disabled={saving} variant="outline" className="w-full">
              {saving && !sendNow ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Calendar className="w-4 h-4 mr-1.5" />}
              {scheduledAt ? 'Schedule' : 'Save as Draft'}
            </Button>
          </div>
        </div>

        {/* Right: Email Content */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Email Content</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue="html">
                <TabsList className="mb-3">
                  <TabsTrigger value="html">HTML</TabsTrigger>
                  <TabsTrigger value="text">Plain Text</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="html">
                  <Textarea
                    placeholder="<html><body><h1>Hello {{first_name}}!</h1>...</body></html>"
                    value={htmlContent}
                    onChange={e => setHtmlContent(e.target.value)}
                    rows={24}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Use {'{{first_name}}'}, {'{{last_name}}'}, {'{{email}}'} for personalization. {'{{unsubscribe_url}}'} is inserted automatically.
                  </p>
                </TabsContent>
                <TabsContent value="text">
                  <Textarea
                    placeholder="Hello {{first_name}},&#10;&#10;Here is your message..."
                    value={textContent}
                    onChange={e => setTextContent(e.target.value)}
                    rows={24}
                    className="font-mono text-xs"
                  />
                </TabsContent>
                <TabsContent value="preview">
                  {htmlContent ? (
                    <div className="border border-border rounded-md overflow-hidden" style={{ height: 520 }}>
                      <iframe
                        srcDoc={htmlContent.replace('{{first_name}}', 'John').replace('{{last_name}}', 'Doe').replace('{{email}}', 'john@example.com')}
                        className="w-full h-full"
                        sandbox="allow-same-origin"
                        title="Email Preview"
                      />
                    </div>
                  ) : (
                    <div className="border border-dashed border-border rounded-md h-[520px] flex items-center justify-center">
                      <p className="text-sm text-muted-foreground">Add HTML content to preview</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
