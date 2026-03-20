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
  name:           z.string().min(1),
  host:           z.string().min(1),
  port:           z.coerce.number().int().min(1).max(65535),
  username:       z.string().min(1),
  password:       z.string().min(1),
  from_email:     z.string().email(),
  from_name:      z.string().optional(),
  encryption:     z.enum(['none', 'ssl', 'tls']),
  max_per_minute: z.coerce.number().int().min(1).max(3600),
  max_per_hour:   z.coerce.number().int().optional().nullable(),
  max_per_day:    z.coerce.number().int().optional().nullable(),
  // warmup
  warmup_enabled:              z.boolean().optional(),
  warmup_start_date:           z.string().optional(),
  warmup_initial_per_minute:   z.coerce.number().int().min(1).optional().nullable(),
  warmup_increment_per_minute: z.coerce.number().int().min(1).optional().nullable(),
  warmup_days_per_step:        z.coerce.number().int().min(1).optional().nullable(),
  warmup_max_per_minute:       z.coerce.number().int().min(1).optional().nullable(),
})
type FormData = z.infer<typeof schema>

// ── Warmup badge shown on server cards ───────────────────────────────────────
function WarmupBadge({ s }: { s: Record<string, unknown> }) {
  if (!s.warmup_enabled) return null

  const start = s.warmup_start_date ? new Date(s.warmup_start_date as string) : null
  const initial   = Number(s.warmup_initial_per_minute   ?? 10)
  const increment = Number(s.warmup_increment_per_minute ?? 10)
  const daysStep  = Math.max(1, Number(s.warmup_days_per_step ?? 1))
  const maxWarmup = Number(s.warmup_max_per_minute ?? s.max_per_minute)

  if (!start) return null

  const daysElapsed = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24))
  const steps = Math.floor(daysElapsed / daysStep)
  const current = Math.min(initial + steps * increment, maxWarmup)
  const finished = current >= Number(s.max_per_minute)

  if (finished) {
    return (
      <span className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-600 rounded font-medium flex items-center gap-1">
        <Flame className="w-3 h-3" /> Calentado
      </span>
    )
  }

  return (
    <span className="text-xs px-1.5 py-0.5 bg-orange-500/10 text-orange-600 rounded font-medium flex items-center gap-1">
      <Flame className="w-3 h-3" /> Warmup: {current}/min (día {daysElapsed})
    </span>
  )
}

// ── Add / Edit form dialog ────────────────────────────────────────────────────
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
      name:           String(editServer.name ?? ''),
      host:           String(editServer.host ?? ''),
      port:           Number(editServer.port ?? 587),
      username:       String(editServer.username ?? ''),
      password:       '',
      from_email:     String(editServer.from_email ?? ''),
      from_name:      String(editServer.from_name ?? ''),
      encryption:     (editServer.encryption as 'none' | 'ssl' | 'tls') ?? 'tls',
      max_per_minute: Number(editServer.max_per_minute ?? 10),
      max_per_hour:   editServer.max_per_hour ? Number(editServer.max_per_hour) : undefined,
      max_per_day:    editServer.max_per_day  ? Number(editServer.max_per_day)  : undefined,
      warmup_enabled:              Boolean(editServer.warmup_enabled),
      warmup_start_date:           (editServer.warmup_start_date as string)?.slice(0, 10) ?? '',
      warmup_initial_per_minute:   editServer.warmup_initial_per_minute ? Number(editServer.warmup_initial_per_minute) : undefined,
      warmup_increment_per_minute: editServer.warmup_increment_per_minute ? Number(editServer.warmup_increment_per_minute) : undefined,
      warmup_days_per_step:        editServer.warmup_days_per_step ? Number(editServer.warmup_days_per_step) : undefined,
      warmup_max_per_minute:       editServer.warmup_max_per_minute ? Number(editServer.warmup_max_per_minute) : undefined,
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editServer ? 'Editar servidor SMTP' : 'Agregar servidor SMTP'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pt-2">

          {/* ── Datos de conexión ── */}
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
              <Input type="password" placeholder={editServer ? '(sin cambios)' : 'Contraseña de app'} {...register('password')} />
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
              <Select defaultValue={editServer?.encryption as string ?? 'tls'} onValueChange={(v) => setValue('encryption', v as 'none' | 'ssl' | 'tls')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">TLS (STARTTLS)</SelectItem>
                  <SelectItem value="ssl">SSL</SelectItem>
                  <SelectItem value="none">Ninguno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Cuotas de envío ── */}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cuotas de envío</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Máx. / minuto</Label>
                <Input type="number" placeholder="10" {...register('max_per_minute')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Máx. / hora</Label>
                <Input type="number" placeholder="600" {...register('max_per_hour')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Máx. / día</Label>
                <Input type="number" placeholder="5000" {...register('max_per_day')} />
              </div>
            </div>
          </div>

          {/* ── Warmup ── */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3 bg-muted/20">
            <button
              type="button"
              className="flex items-center justify-between w-full text-left"
              onClick={() => setShowWarmup(v => !v)}
            >
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Warmup progresivo</p>
              </div>
              {showWarmup ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showWarmup && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-sm">Activar warmup</Label>
                    <p className="text-xs text-muted-foreground">
                      Aumenta gradualmente el límite de envío desde el valor inicial hasta el máximo configurado.
                    </p>
                  </div>
                  <Switch
                    checked={warmupEnabled ?? false}
                    onCheckedChange={(v) => setValue('warmup_enabled', v)}
                  />
                </div>

                {warmupEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Fecha de inicio del warmup</Label>
                      <Input type="date" {...register('warmup_start_date')} />
                      <p className="text-xs text-muted-foreground">Desde qué fecha se calcula el warmup.</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Inicio (emails/min)</Label>
                      <Input type="number" placeholder="10" {...register('warmup_initial_per_minute')} />
                      <p className="text-xs text-muted-foreground">Capacidad el día 1.</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Incremento (emails/min)</Label>
                      <Input type="number" placeholder="10" {...register('warmup_increment_per_minute')} />
                      <p className="text-xs text-muted-foreground">Cuánto sube por paso.</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Días por paso</Label>
                      <Input type="number" placeholder="1" {...register('warmup_days_per_step')} />
                      <p className="text-xs text-muted-foreground">Cada cuántos días sube.</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Límite máx. warmup (emails/min)</Label>
                      <Input type="number" placeholder="100" {...register('warmup_max_per_minute')} />
                      <p className="text-xs text-muted-foreground">Tope del warmup. Al alcanzarlo se usa el límite normal.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Server className="w-4 h-4 mr-1.5" />}
            {editServer ? 'Guardar cambios' : 'Agregar servidor'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SmtpPage() {
  const { data: servers, isLoading } = useSWR('/api/smtp', fetcher)
  const [testing, setTesting] = useState<string | null>(null)

  const testServer = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/smtp/${id}/test`, { method: 'POST' })
      const json = await res.json()
      if (json.data?.success) toast.success('Conexión exitosa')
      else toast.error(`Error: ${json.data?.error || json.error}`)
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Servidores SMTP</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona tus servidores de correo saliente, cuotas y warmup.</p>
        </div>
        <SmtpFormDialog
          trigger={<Button><Plus className="w-4 h-4 mr-1.5" /> Agregar servidor</Button>}
          onSuccess={() => {}}
        />
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
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-medium text-sm text-foreground">{s.name as string}</p>
                      {s.is_dedicated && <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium">Dedicado</span>}
                      {s.last_test_status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                      {s.last_test_status === 'failed' && <XCircle className="w-3.5 h-3.5 text-destructive" />}
                      <WarmupBadge s={s} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.host}:{s.port as number} · {s.from_email as string} · {s.max_per_minute as number}/min
                      {s.max_per_hour ? ` · ${s.max_per_hour}/hora` : ''}
                      {s.max_per_day  ? ` · ${s.max_per_day}/día`  : ''}
                    </p>
                    {(Number(s.sent_today) > 0 || Number(s.sent_this_hour) > 0) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Number(s.sent_today).toLocaleString()} enviados hoy · {Number(s.sent_this_hour)} esta hora
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <SmtpFormDialog
                      trigger={
                        <Button size="sm" variant="outline">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      }
                      editServer={s}
                      onSuccess={() => {}}
                    />
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
