'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import {
  Plus, Server, Trash2, TestTube, CheckCircle, XCircle,
  Loader2, Flame, ChevronDown, ChevronUp, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
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
  max_per_hour: z.coerce.number().int().optional().nullable(),
  max_per_day: z.coerce.number().int().optional().nullable(),
  warmup_enabled: z.boolean().optional(),
  warmup_start_date: z.string().optional(),
  warmup_initial_per_minute: z.coerce.number().int().min(1).optional().nullable(),
  warmup_increment_per_minute: z.coerce.number().int().min(1).optional().nullable(),
  warmup_days_per_step: z.coerce.number().int().min(1).optional().nullable(),
  warmup_max_per_minute: z.coerce.number().int().min(1).optional().nullable(),
})
type FormData = z.infer<typeof schema>

function WarmupBadge({ s }: { s: Record<string, unknown> }) {
  if (!s.warmup_enabled) return null
  const start = s.warmup_start_date ? new Date(s.warmup_start_date as string) : null
  const initial = Number(s.warmup_initial_per_minute ?? 10)
  const increment = Number(s.warmup_increment_per_minute ?? 10)
  const daysStep = Math.max(1, Number(s.warmup_days_per_step ?? 1))
  const maxWarmup = Number(s.warmup_max_per_minute ?? s.max_per_minute)
  if (!start) return null
  const daysElapsed = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24))
  const steps = Math.floor(daysElapsed / daysStep)
  const current = Math.min(initial + steps * increment, maxWarmup)
  const finished = current >= Number(s.max_per_minute)
  if (finished) {
    return <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Flame className="h-3 w-3" />Calentado</span>
  }
  return <span className="text-xs bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Flame className="h-3 w-3" />Warmup: {current}/min (día {daysElapsed})</span>
}

function SmtpFormDialog({
  trigger,
  editServer,
  onSuccess,
}: {
  trigger: React.ReactNode
  editServer?: Record<string, unknown>
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [showWarmup, setShowWarmup] = useState(false)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: editServer ? {
      name: String(editServer.name ?? ''),
      host: String(editServer.host ?? ''),
      port: Number(editServer.port ?? 587),
      username: String(editServer.username ?? ''),
      password: '',
      from_email: String(editServer.from_email ?? ''),
      from_name: String(editServer.from_name ?? ''),
      encryption: (editServer.encryption as 'none' | 'ssl' | 'tls') ?? 'tls',
      max_per_minute: Number(editServer.max_per_minute ?? 10),
      max_per_hour: editServer.max_per_hour ? Number(editServer.max_per_hour) : undefined,
      max_per_day: editServer.max_per_day ? Number(editServer.max_per_day) : undefined,
      warmup_enabled: Boolean(editServer.warmup_enabled),
      warmup_start_date: (editServer.warmup_start_date as string)?.slice(0, 10) ?? '',
      warmup_initial_per_minute: editServer.warmup_initial_per_minute ? Number(editServer.warmup_initial_per_minute) : undefined,
      warmup_increment_per_minute: editServer.warmup_increment_per_minute ? Number(editServer.warmup_increment_per_minute) : undefined,
      warmup_days_per_step: editServer.warmup_days_per_step ? Number(editServer.warmup_days_per_step) : undefined,
      warmup_max_per_minute: editServer.warmup_max_per_minute ? Number(editServer.warmup_max_per_minute) : undefined,
    } : {
      port: 587, encryption: 'tls', max_per_minute: 10,
      warmup_enabled: false,
      warmup_initial_per_minute: 10,
      warmup_increment_per_minute: 10,
      warmup_days_per_step: 1,
    },
  })

  const warmupEnabled = watch('warmup_enabled')

  const onSubmit = async (data: FormData) => {
    const isEdit = Boolean(editServer)
    const url = isEdit ? `/api/smtp/${editServer!.id}` : '/api/smtp'
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error || 'Error al guardar'); return }
    toast.success(isEdit ? 'Servidor actualizado' : 'Servidor SMTP agregado')
    mutate('/api/smtp')
    reset()
    setOpen(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editServer ? 'Editar servidor SMTP' : 'Agregar servidor SMTP'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nombre del servidor</Label>
              <Input {...register('name')} placeholder="Mi servidor" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Host</Label>
              <Input {...register('host')} placeholder="smtp.example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Puerto</Label>
              <Input {...register('port')} type="number" placeholder="587" />
            </div>
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input {...register('username')} />
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña</Label>
              <Input {...register('password')} type="password" />
            </div>
            <div className="space-y-1.5">
              <Label>Email remitente</Label>
              <Input {...register('from_email')} placeholder="no-reply@example.com" />
              {errors.from_email && <p className="text-xs text-destructive">{errors.from_email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nombre remitente</Label>
              <Input {...register('from_name')} placeholder="Mi Empresa" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Cifrado</Label>
              <Select defaultValue="tls" onValueChange={v => setValue('encryption', v as 'none' | 'ssl' | 'tls')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">TLS (STARTTLS)</SelectItem>
                  <SelectItem value="ssl">SSL</SelectItem>
                  <SelectItem value="none">Ninguno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Máx. / minuto</Label>
              <Input {...register('max_per_minute')} type="number" />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. / hora</Label>
              <Input {...register('max_per_hour')} type="number" />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. / día</Label>
              <Input {...register('max_per_day')} type="number" />
            </div>
          </div>

          <div>
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium w-full py-2"
              onClick={() => setShowWarmup(v => !v)}
            >
              <Flame className="h-4 w-4 text-orange-500" />
              Warmup progresivo
              {showWarmup ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
            </button>

            {showWarmup && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Activar warmup</Label>
                    <p className="text-xs text-muted-foreground">Aumenta gradualmente el límite desde el valor inicial hasta el máximo.</p>
                  </div>
                  <Switch checked={!!warmupEnabled} onCheckedChange={v => setValue('warmup_enabled', v)} />
                </div>

                {warmupEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label>Fecha de inicio</Label>
                      <Input {...register('warmup_start_date')} type="date" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Inicio (emails/min)</Label>
                      <Input {...register('warmup_initial_per_minute')} type="number" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Incremento (emails/min)</Label>
                      <Input {...register('warmup_increment_per_minute')} type="number" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Días por paso</Label>
                      <Input {...register('warmup_days_per_step')} type="number" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Límite máx. warmup</Label>
                      <Input {...register('warmup_max_per_minute')} type="number" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editServer ? 'Guardar cambios' : 'Agregar servidor'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function SmtpPage() {
  const { data: servers, isLoading } = useSWR('/api/smtp', fetcher)
  const [testing, setTesting] = useState<string | null>(null)

  const testServer = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/smtp/${id}/test`, { method: 'POST' })
      const json = await res.json()
      if (res.ok && json.data?.status === 'success') toast.success('Conexión SMTP exitosa')
      else toast.error(`Error: ${json.data?.message || json.error || 'Conexión fallida'}`)
      mutate('/api/smtp')
    } catch { toast.error('Test fallido') }
    finally { setTesting(null) }
  }

  const deleteServer = async (id: string) => {
    if (!confirm('¿Eliminar este servidor SMTP?')) return
    await fetch(`/api/smtp/${id}`, { method: 'DELETE' })
    toast.success('Servidor eliminado')
    mutate('/api/smtp')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servidores SMTP</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestiona tus servidores de correo saliente, cuotas y warmup.</p>
        </div>
        <SmtpFormDialog
          trigger={<Button><Plus className="h-4 w-4" />Agregar servidor</Button>}
          onSuccess={() => {}}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !servers?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Server className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No hay servidores SMTP configurados</p>
            <p className="text-sm text-muted-foreground">Agrega un servidor para comenzar a enviar campañas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {servers.map((s: Record<string, unknown>) => (
            <Card key={s.id as string}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <Server className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{s.name as string}</p>
                      {s.is_dedicated && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Dedicado</span>}
                      {s.last_test_status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {s.last_test_status === 'failed' && <XCircle className="h-4 w-4 text-destructive" />}
                      <WarmupBadge s={s} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.host}:{s.port as number} · {s.from_email as string} · {s.max_per_minute as number}/min
                      {s.max_per_hour ? ` · ${s.max_per_hour}/hora` : ''}
                      {s.max_per_day ? ` · ${s.max_per_day}/día` : ''}
                    </p>
                    {s.last_tested_at && (
                      <p className="text-xs text-muted-foreground">
                        Último test: {new Date(s.last_tested_at as string).toLocaleString('es-CL')}
                        {' · '}
                        <span className={s.last_test_status === 'success' ? 'text-green-500' : 'text-destructive'}>
                          {s.last_test_status === 'success' ? 'Exitoso' : 'Fallido'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <SmtpFormDialog
                    trigger={<Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>}
                    editServer={s}
                    onSuccess={() => {}}
                  />
                  <Button variant="outline" size="sm" onClick={() => testServer(s.id as string)} disabled={testing === s.id as string}>
                    {testing === s.id as string ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => deleteServer(s.id as string)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
