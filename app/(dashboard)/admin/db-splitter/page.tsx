'use client'

import { useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const ROWS_PER_FILE = 50_000

interface FileInfo { name: string; totalRows: number; totalParts: number }
type Phase = 'idle' | 'reading' | 'splitting' | 'done' | 'error'

export default function DbSplitterPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [currentPart, setCurrentPart] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const pct = fileInfo ? Math.round((currentPart / fileInfo.totalParts) * 100) : 0

  const processFile = useCallback(async (file: File) => {
    setPhase('reading'); setCurrentPart(0); setFileInfo(null); setErrorMsg('')
    try {
      const buffer = await file.arrayBuffer()
      setPhase('splitting')
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true, dense: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const allData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
      const totalParts = Math.ceil(allData.length / ROWS_PER_FILE)
      const baseName = file.name.replace(/\.[^.]+$/, '')
      setFileInfo({ name: file.name, totalRows: allData.length, totalParts })
      const headers = allData.length > 0 ? Object.keys(allData[0]) : []

      for (let i = 0; i < totalParts; i++) {
        const chunk = allData.slice(i * ROWS_PER_FILE, (i + 1) * ROWS_PER_FILE)
        const escape = (val: unknown): string => {
          const s = val === null || val === undefined ? '' : String(val)
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
        }
        const rows = [headers.map(escape).join(','), ...chunk.map(row => headers.map(h => escape(row[h])).join(','))]
        const csv = rows.join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${baseName}_parte${i + 1}de${totalParts}.csv`; a.click()
        URL.revokeObjectURL(url)
        setCurrentPart(i + 1)
        await new Promise(r => setTimeout(r, 80))
      }
      setPhase('done')
    } catch (e: unknown) { setErrorMsg((e as Error).message || 'Error desconocido'); setPhase('error') }
  }, [])

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'csv', 'xls'].includes(ext ?? '')) { setErrorMsg('Solo se aceptan archivos .xlsx, .xls o .csv'); setPhase('error'); return }
    processFile(file)
  }

  const reset = () => { setPhase('idle'); setFileInfo(null); setCurrentPart(0); setErrorMsg(''); if (inputRef.current) inputRef.current.value = '' }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Divisor de BBDD</CardTitle>
          <CardDescription>Divide archivos Excel o CSV grandes en partes de {ROWS_PER_FILE.toLocaleString('es-CL')} filas. Todo se procesa localmente — ningún dato se sube al servidor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />

          {(phase === 'idle' || phase === 'error') && (
            <div
              className={cn('border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none', dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/60')}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              <p className="font-medium">Arrastra tu archivo aquí o haz clic para seleccionar</p>
              <p className="text-sm text-muted-foreground">.xlsx, .xls, .csv</p>
            </div>
          )}

          {phase === 'error' && <p className="text-sm text-destructive text-center">{errorMsg}</p>}
          {phase === 'reading' && <p className="text-sm text-muted-foreground text-center">Cargando archivo en memoria...</p>}

          {(phase === 'splitting' || phase === 'done') && fileInfo && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{fileInfo.name}</span>
                <span className="text-muted-foreground">{fileInfo.totalRows.toLocaleString('es-CL')} filas</span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{phase === 'done' ? `Completado — ${fileInfo.totalParts} archivos generados` : `Generando parte ${currentPart + 1} de ${fileInfo.totalParts}...`}</span>
                <span>{pct}%</span>
              </div>
              {phase === 'done' && <p className="text-sm text-muted-foreground">Revisa tu carpeta de descargas — se generaron {fileInfo.totalParts} archivos.</p>}
            </div>
          )}

          {(phase === 'done' || phase === 'error') && (
            <Button variant="outline" onClick={reset} className="w-full">Dividir otro archivo</Button>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">Procesamiento 100% local · Ningún dato sale de tu equipo</p>
    </div>
  )
}
