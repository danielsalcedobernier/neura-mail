'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Bell, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

interface Notification { id: string; title: string; message: string; type: string; created_at: string }

export default function AdminNotificationsPage() {
  const { data: notifications, isLoading } = useSWR('/api/admin/notifications', fetcher)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState('info')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!title || !message) { toast.error('Title and message are required'); return }
    setSending(true)
    const res = await fetch('/api/admin/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message, type, broadcast: true }) })
    const json = await res.json()
    if (!res.ok) toast.error(json.error || 'Send failed')
    else { toast.success('Notification sent to all users'); setTitle(''); setMessage(''); mutate('/api/admin/notifications') }
    setSending(false)
  }

  const TYPE_BADGE: Record<string, string> = {
    info: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
    warning: 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20',
    error: 'bg-red-500/10 text-red-600 border border-red-500/20',
    success: 'bg-green-500/10 text-green-600 border border-green-500/20',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3"><Bell className="w-6 h-6 text-primary" /><h1 className="text-2xl font-bold">Notifications</h1></div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Send Notification</CardTitle>
            <CardDescription>Broadcast to all active users</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Maintenance window" /></div>
            <div className="space-y-1"><Label>Message</Label><Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your notification message here..." rows={4} /></div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="info">Info</SelectItem><SelectItem value="warning">Warning</SelectItem><SelectItem value="error">Error</SelectItem><SelectItem value="success">Success</SelectItem></SelectContent>
              </Select>
            </div>
            <Button onClick={send} disabled={sending} className="w-full">{sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}Send to All Users</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Notifications</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> :
              (notifications || []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No notifications sent yet</p> : (
                <div className="space-y-3">
                  {(notifications || []).slice(0, 10).map((n: Notification) => (
                    <div key={n.id} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{n.title}</span>
                        <span className={`text-xs rounded px-1.5 py-0.5 ${TYPE_BADGE[n.type] || ''}`}>{n.type}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{n.message}</p>
                      <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
