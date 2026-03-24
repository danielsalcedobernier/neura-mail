'use client'

import { useRef, useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Download, X, SplitSquareHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FileInfo {
  name: string
  totalRows: number
  totalParts: number
}

type Phase = 'idle' | 'reading' | 'splitting' | 'done' | 'error'
type SplitMode = 'parts' | 'rows'

export default function DbSplitterPage() {
  const inputRef                        = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]         = useState(false)
  const [phase, setPhase]               = useState<Phase>('idle')
  const [fileInfo, setFileInfo]         = useState<FileInfo | null>(null)
  const [currentPart, setCurrentPart]   = useState(0)
  const [errorMsg, setErrorMsg]         = useState('')
  const [splitMode, setSplitMode]       = useState<SplitMode>('parts')
  const [numParts, setNumParts]         = useState('2')
  const [rowsPerPart, setRowsPerPart]   = useState('50000')
  const [pendingFile, setPendingFile]   = useState<File | null>(null)

  const pct = fileInfo
    ? Math.round((currentPart / fileInfo.totalParts) * 100)
    : 0

  // ── TXT processing ─────────────────────────────────────────────────────────
  const processTxt = useCallback(async (file: File, parts: number) => {
    const text  = await file.text()
    const lines = text.split(/\r?\n/)
    // Remove trailing empty line if present
    if (lines[lines.length - 1].trim() === '') lines.pop()

    const totalRows  = lines.length
    const totalParts = parts
    const chunkSize  = Math.ceil(totalRows / totalParts)
    const baseName   = file.name.replace(/\.[^.]+$/, '')

    setFileInfo({ name: file.name, totalRows, totalParts })

    for (let i = 0; i < totalParts; i++) {
      const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize)
      const blob  = new Blob([chunk.join('\n')], { type: 'text/plain;charset=utf-8;' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      a.download  = `${baseName}_parte${i + 1}de${totalParts}.txt`
      a.click()
      URL.revokeObjectURL(url)
      setCurrentPart(i + 1)
      await new Promise(r => setTimeout(r, 60))
    }
  }, [])

  // ── XLSX / CSV processing ──────────────────────────────────────────────────
  const processSpreadsheet = useCallback(async (file: File, parts: number) => {
    const buffer  = await file.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(buffer), {
      type: 'array',
      cellDates: true,
      dense: true,
    })
    const sheet   = workbook.Sheets[workbook.SheetNames[0]]
    const allData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

    const totalRows  = allData.length
    const totalParts = parts
    const chunkSize  = Math.ceil(totalRows / totalParts)
    const baseName   = file.name.replace(/\.[^.]+$/, '')

    setFileInfo({ name: file.name, totalRows, totalParts })

    const headers = allData.length > 0 ? Object.keys(allData[0]) : []

    const escape = (val: unknown): string => {
      const s = val === null || val === undefined ? '' : String(val)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }

    for (let i = 0; i < totalParts; i++) {
      const chunk = allData.slice(i * chunkSize, (i + 1) * chunkSize)
      const rows  = [
        headers.map(escape).join(','),
        ...chunk.map(row => headers.map(h => escape(row[h])).join(',')),
      ]
      const csv  = rows.join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${baseName}_parte${i + 1}de${totalParts}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setCurrentPart(i + 1)
      await new Promise(r => setTimeout(r, 80))
    }
  }, [])

  // ── Main orchestrator ──────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setPhase('reading')
    setCurrentPart(0)
    setFileInfo(null)
    setErrorMsg('')

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

      // Resolve number of parts based on split mode
      // For rows mode we need to peek at total lines first
      let resolvedParts: number

      if (splitMode === 'parts') {
        resolvedParts = Math.max(1, parseInt(numParts, 10) || 2)
      } else {
        // rows mode — count lines to calculate parts
        const rpp = Math.max(1, parseInt(rowsPerPart, 10) || 50_000)
        if (ext === 'txt') {
          const text  = await file.text()
          const lines = text.split(/\r?\n/).filter((_, idx, arr) =>
            idx < arr.length - 1 || arr[idx].trim() !== ''
          )
          resolvedParts = Math.ceil(lines.length / rpp)
        } else {
          const buffer  = await file.arrayBuffer()
          const wb      = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true })
          const sheet   = wb.Sheets[wb.SheetNames[0]]
          const data    = XLSX.utils.sheet_to_json(sheet)
          resolvedParts = Math.ceil(data.length / rpp)
        }
        resolvedParts = Math.max(1, resolvedParts)
      }

      setPhase('splitting')

      if (ext === 'txt') {
        await processTxt(file, resolvedParts)
      } else {
        await processSpreadsheet(file, resolvedParts)
      }

      setPhase('done')
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || 'Error desconocido')
      setPhase('error')
    }
  }, [splitMode, numParts, rowsPerPart, processTxt, processSpreadsheet])

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'csv', 'xls', 'txt'].includes(ext ?? '')) {
      setErrorMsg('Solo se aceptan archivos .xlsx, .xls, .csv o .txt')
      setPhase('error')
      return
    }
    setPendingFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleStart = () => {
    if (pendingFile) processFile(pendingFile)
  }

  const reset = () => {
    setPhase('idle')
    setFileInfo(null)
    setCurrentPart(0)
    setErrorMsg('')
    setPendingFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const isIdle = phase === 'idle' || phase === 'error'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Divisor de BBDD</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Divide archivos Excel, CSV o TXT grandes en partes iguales. Los archivos de salida mantienen el formato original (.csv o .txt). Todo se procesa localmente en tu navegador — ningún dato se sube al servidor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Cargar archivo
          </CardTitle>
          <CardDescription>
            Formatos soportados: .xlsx, .xls, .csv, .txt
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">

          {/* Drop zone */}
          {isIdle && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => !pendingFile && inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 transition-colors select-none',
                pendingFile
                  ? 'border-primary/60 bg-primary/5 cursor-default'
                  : 'cursor-pointer border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40',
                dragging && 'border-primary bg-primary/5'
              )}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              {pendingFile ? (
                <p className="text-sm font-medium text-foreground text-center">{pendingFile.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  Arrastra tu archivo aquí o{' '}
                  <span className="text-primary font-medium">haz clic para seleccionar</span>
                </p>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {/* Split config — shown once a file is selected */}
          {isIdle && pendingFile && (
            <div className="flex flex-col gap-4 p-4 rounded-lg border bg-muted/30">
              <p className="text-sm font-medium text-foreground">Configurar división</p>

              {/* Mode toggle */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={splitMode === 'parts' ? 'default' : 'outline'}
                  onClick={() => setSplitMode('parts')}
                >
                  Por cantidad de partes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={splitMode === 'rows' ? 'default' : 'outline'}
                  onClick={() => setSplitMode('rows')}
                >
                  Por filas por parte
                </Button>
              </div>

              {splitMode === 'parts' ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="num-parts" className="text-sm">Cantidad de partes</Label>
                  <Input
                    id="num-parts"
                    type="number"
                    min={2}
                    max={500}
                    value={numParts}
                    onChange={e => setNumParts(e.target.value)}
                    className="max-w-[140px]"
                    placeholder="2"
                  />
                  <p className="text-xs text-muted-foreground">
                    El archivo se dividirá en exactamente este número de partes iguales.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rows-per-part" className="text-sm">Filas por parte</Label>
                  <Input
                    id="rows-per-part"
                    type="number"
                    min={1}
                    value={rowsPerPart}
                    onChange={e => setRowsPerPart(e.target.value)}
                    className="max-w-[160px]"
                    placeholder="50000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se calculará automáticamente cuántas partes se necesitan.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleStart} className="flex items-center gap-2">
                  <SplitSquareHorizontal className="w-4 h-4" />
                  Dividir archivo
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

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

          {/* Splitting / Done */}
          {(phase === 'splitting' || phase === 'done') && fileInfo && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate max-w-xs">{fileInfo.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {fileInfo.totalRows.toLocaleString('es-CL')} filas · {fileInfo.totalParts} partes
                </span>
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
