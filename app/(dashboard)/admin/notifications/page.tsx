'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Bell, Send, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

interface Notification {
  id: string
  title: string
  message: string
  type: string
  is_global: boolean
  user_id?: string
  created_at: string
}

export default function AdminNotificationsPage() {
  const { data: notifications, isLoading } = useSWR('/api/admin/notifications', fetcher)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState('info')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!title || !message) { toast.error('Title and message are required'); return }
    setSending(true)
    const res = await fetch('/api/admin/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, type, broadcast: true }),
    })
    const json = await res.json()
    if (!res.ok) toast.error(json.error || 'Send failed')
    else {
      toast.success('Notification sent to all users')
      setTitle(''); setMessage('')
      mutate('/api/admin/notifications')
    }
    setSending(false)
  }

  const TYPE_BADGE: Record<string, string> = {
    info: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    error: 'bg-red-500/10 text-red-600 border-red-500/20',
    success: 'bg-green-500/10 text-green-600 border-green-500/20',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">Send global announcements to all users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="w-4 h-4" />
              Send Notification
            </CardTitle>
            <CardDescription>Broadcast to all active users</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Maintenance window" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Write your notification message here..."
                rows={4}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={send} disabled={sending} className="self-start">
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send to All Users
            </Button>
          </CardContent>
        </Card>

        {/* Recent */}
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">Recent Notifications</h2>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
          ) : (notifications || []).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No notifications sent yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(notifications || []).slice(0, 10).map((n: Notification) => (
                <div key={n.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <Badge className={`text-xs border shrink-0 ${TYPE_BADGE[n.type] || ''}`} variant="outline">{n.type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.message}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1.5">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
