'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Plus, Server, Trash2, TestTube, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const schema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().min(1),
  from_email: z.string().email(),
  from_name: z.string().optional(),
  encryption: z.enum(['none', 'ssl', 'tls']),
  max_per_minute: z.coerce.number().int().min(1).max(3600),
  max_per_hour: z.coerce.number().int().optional(),
  max_per_day: z.coerce.number().int().optional(),
})
type FormData = z.infer<typeof schema>

export default function SmtpPage() {
  const { data: servers, isLoading } = useSWR('/api/smtp', fetcher)
  const [open, setOpen] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { port: 587, encryption: 'tls', max_per_minute: 10 },
  })

  const onSubmit = async (data: FormData) => {
    const res = await fetch('/api/smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'Failed to add server'); return }
    toast.success('SMTP server added!')
    mutate('/api/smtp')
    reset()
    setOpen(false)
  }

  const testServer = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/smtp/${id}/test`, { method: 'POST' })
      const json = await res.json()
      if (json.data?.success) toast.success('Connection test passed!')
      else toast.error(`Test failed: ${json.data?.error || json.error}`)
      mutate('/api/smtp')
    } catch { toast.error('Test failed') }
    finally { setTesting(null) }
  }

  const deleteServer = async (id: string) => {
    if (!confirm('Delete this SMTP server?')) return
    await fetch(`/api/smtp/${id}`, { method: 'DELETE' })
    toast.success('Server removed')
    mutate('/api/smtp')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Servidores SMTP</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona tus servidores de correo saliente y límites de envío.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1.5" /> Agregar servidor</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Agregar servidor SMTP</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label>Nombre del servidor</Label>
                  <Input placeholder="Mi servidor Gmail" {...register('name')} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Host</Label>
                  <Input placeholder="smtp.gmail.com" {...register('host')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Puerto</Label>
                  <Input type="number" placeholder="587" {...register('port')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Usuario</Label>
                  <Input placeholder="user@gmail.com" {...register('username')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Contraseña</Label>
                  <Input type="password" placeholder="Contraseña de app" {...register('password')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Email remitente</Label>
                  <Input placeholder="newsletter@empresa.com" {...register('from_email')} />
                  {errors.from_email && <p className="text-xs text-destructive">{errors.from_email.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Nombre remitente</Label>
                  <Input placeholder="Mi empresa" {...register('from_name')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Cifrado</Label>
                  <Select defaultValue="tls" onValueChange={(v) => setValue('encryption', v as 'none' | 'ssl' | 'tls')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS (STARTTLS)</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="none">Ninguno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Máx. / minuto</Label>
                  <Input type="number" placeholder="10" {...register('max_per_minute')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Máx. / hora (opcional)</Label>
                  <Input type="number" placeholder="600" {...register('max_per_hour')} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Máx. / día (opcional)</Label>
                  <Input type="number" placeholder="5000" {...register('max_per_day')} />
                </div>
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Server className="w-4 h-4 mr-1.5" />}
                Agregar servidor
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : !servers?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <Server className="w-10 h-10 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">No hay servidores SMTP configurados</p>
            <p className="text-xs text-muted-foreground">Agrega un servidor para comenzar a enviar campañas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {servers.map((s: Record<string, unknown>) => (
            <Card key={s.id as string}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${s.is_dedicated ? 'bg-primary/10' : 'bg-muted'}`}>
                    <Server className={`w-5 h-5 ${s.is_dedicated ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-sm text-foreground">{s.name as string}</p>
                      {s.is_dedicated && <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">Dedicado</span>}
                      {s.last_test_status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                      {s.last_test_status === 'failed' && <XCircle className="w-3.5 h-3.5 text-destructive" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.host}:{s.port as number} · {s.from_email as string} · {s.max_per_minute as number}/min
                    </p>
                    {(s.sent_today as number) > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Number(s.sent_today).toLocaleString('es-CL')} enviados hoy · {Number(s.sent_this_hour)} esta hora
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => testServer(s.id as string)} disabled={testing === s.id as string}>
                      {testing === s.id as string ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteServer(s.id as string)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
