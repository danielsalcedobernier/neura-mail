'use client'

import { useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const ROWS_PER_FILE = 50_000

interface FileInfo {
  name: string
  totalRows: number
  totalParts: number
}

type Phase = 'idle' | 'reading' | 'splitting' | 'done' | 'error'

export default function DbSplitterPage() {
  const inputRef                  = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]   = useState(false)
  const [phase, setPhase]         = useState<Phase>('idle')
  const [fileInfo, setFileInfo]   = useState<FileInfo | null>(null)
  const [currentPart, setCurrentPart] = useState(0)
  const [errorMsg, setErrorMsg]   = useState('')

  const pct = fileInfo
    ? Math.round((currentPart / fileInfo.totalParts) * 100)
    : 0

  const processFile = useCallback(async (file: File) => {
    if (!file) return
    setPhase('reading')
    setCurrentPart(0)
    setFileInfo(null)
    setErrorMsg('')

    try {
      const buffer = await file.arrayBuffer()
      setPhase('splitting')

      const workbook = XLSX.read(new Uint8Array(buffer), {
        type: 'array',
        cellDates: true,
        dense: true,
      })
      const sheet   = workbook.Sheets[workbook.SheetNames[0]]
      const allData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

      const totalParts = Math.ceil(allData.length / ROWS_PER_FILE)
      const baseName   = file.name.replace(/\.[^.]+$/, '')

      setFileInfo({ name: file.name, totalRows: allData.length, totalParts })

      for (let i = 0; i < totalParts; i++) {
        const chunk   = allData.slice(i * ROWS_PER_FILE, (i + 1) * ROWS_PER_FILE)
        const wb      = XLSX.utils.book_new()
        const ws      = XLSX.utils.json_to_sheet(chunk)
        XLSX.utils.book_append_sheet(wb, ws, 'Data')
        XLSX.writeFile(wb, `${baseName}_parte${i + 1}de${totalParts}.xlsx`)
        setCurrentPart(i + 1)
        // Yield to GC between chunks
        await new Promise(r => setTimeout(r, 80))
      }

      setPhase('done')
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || 'Error desconocido')
      setPhase('error')
    }
  }, [])

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'csv', 'xls'].includes(ext ?? '')) {
      setErrorMsg('Solo se aceptan archivos .xlsx, .xls o .csv')
      setPhase('error')
      return
    }
    processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const reset = () => {
    setPhase('idle')
    setFileInfo(null)
    setCurrentPart(0)
    setErrorMsg('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Divisor de BBDD</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Divide archivos Excel o CSV grandes en partes de {ROWS_PER_FILE.toLocaleString('es-CL')} filas. Todo se procesa localmente en tu navegador — ningún dato se sube al servidor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Cargar archivo
          </CardTitle>
          <CardDescription>
            Formatos soportados: .xlsx, .xls, .csv
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">

          {/* Drop zone */}
          {phase === 'idle' || phase === 'error' ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40'
              )}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Arrastra tu archivo aquí o <span className="text-primary font-medium">haz clic para seleccionar</span>
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : null}

          {/* Error state */}
          {phase === 'error' && (
            <div className="flex items-start gap-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <X className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Reading */}
          {phase === 'reading' && (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Cargando archivo en memoria...
            </div>
          )}

          {/* Splitting */}
          {(phase === 'splitting' || phase === 'done') && fileInfo && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate max-w-xs">{fileInfo.name}</span>
                <span className="text-muted-foreground shrink-0">{fileInfo.totalRows.toLocaleString('es-CL')} filas</span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {phase === 'done'
                    ? `Completado — ${fileInfo.totalParts} archivos generados`
                    : `Generando parte ${currentPart + 1} de ${fileInfo.totalParts}...`}
                </span>
                <span>{pct}%</span>
              </div>

              {phase === 'done' && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-700 text-sm">
                  <Download className="w-4 h-4 shrink-0" />
                  Revisa tu carpeta de descargas — se generaron {fileInfo.totalParts} archivos.
                </div>
              )}
            </div>
          )}

          {(phase === 'done' || phase === 'error') && (
            <Button variant="outline" size="sm" onClick={reset} className="self-start">
              Dividir otro archivo
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Procesamiento 100% local · Ningún dato sale de tu equipo
      </p>
    </div>
  )
}
