'use client'

import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Upload, Plus, Trash2, Eye, FileText, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data)

const statusBadge: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  processing: 'bg-yellow-500/10 text-yellow-600',
  ready: 'bg-green-500/10 text-green-600',
  error: 'bg-destructive/10 text-destructive',
}

export default function ListsPage() {
  const { data: lists, isLoading } = useSWR('/api/lists', fetcher, { refreshInterval: 5000 })
  const [uploading, setUploading] = useState(false)
  const [open, setOpen] = useState(false)
  const [listName, setListName] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const handleUpload = async () => {
    if (!file || !listName.trim()) { toast.error('Please enter a name and select a file'); return }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('name', listName)
      form.append('file', file)
      const res = await fetch('/api/lists', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Upload failed'); return }
      toast.success('List uploaded! Processing started.')
      mutate('/api/lists')
      setOpen(false)
      setListName('')
      setFile(null)
    } catch { toast.error('Upload failed') }
    finally { setUploading(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this list and all its contacts?')) return
    const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('List deleted'); mutate('/api/lists') }
    else toast.error('Delete failed')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Listas de email</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Sube archivos CSV y gestiona tus listas de contactos.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1.5" /> Subir lista</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Subir lista de email</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label>Nombre de la lista</Label>
                <Input placeholder="Ej: Newsletter Q1 2025" value={listName} onChange={e => setListName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Archivo CSV</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    id="file-upload"
                    className="hidden"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    {file ? (
                      <span className="text-sm font-medium text-foreground">{file.name}</span>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-foreground">Haz clic o arrastra un archivo</span>
                        <span className="text-xs text-muted-foreground">CSV con columna email (máx 500MB)</span>
                      </>
                    )}
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">Columnas: email, first_name, last_name (opcional)</p>
              </div>
              <Button onClick={handleUpload} disabled={uploading} className="w-full">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Subiendo...</> : <><Upload className="w-4 h-4 mr-1.5" /> Subir y procesar</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !lists?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-10 h-10 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">Aún no hay listas</p>
            <p className="text-xs text-muted-foreground">Sube tu primer CSV para comenzar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {lists.map((list: Record<string, unknown>) => (
            <Card key={list.id as string} className="hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-foreground text-sm truncate">{list.name as string}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[list.status as string]}`}>
                        {list.status as string}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{Number(list.total_count).toLocaleString('es-CL')} total</span>
                      <span className="text-green-600">{Number(list.valid_count).toLocaleString('es-CL')} válidos</span>
                      <span className="text-destructive">{Number(list.invalid_count).toLocaleString('es-CL')} inválidos</span>
                      <span>{Number(list.unverified_count).toLocaleString('es-CL')} sin verificar</span>
                    </div>
                    {list.status === 'processing' && (
                      <div className="mt-2">
                        <Progress value={Number(list.processing_progress)} className="h-1.5" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {list.status === 'ready' && Number(list.unverified_count) > 0 && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/dashboard/verification?list=${list.id}`}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Verificar</a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(list.id as string)}>
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
