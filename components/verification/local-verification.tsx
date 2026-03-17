'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogLine {
  ts: string
  type: 'info' | 'success' | 'warn' | 'error' | 'dim'
  text: string
}

interface LocalVerificationProps {
  jobId: string
  jobName: string
  totalEmails: number
  onComplete?: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE         = 50_000   // emails per mails.so batch
const POLL_INTERVAL_MS   = 10_000   // poll every 10s
const MAX_POLL_SECONDS   = 800      // give up after 800s per batch
const MAX_POLLS          = Math.ceil(MAX_POLL_SECONDS * 1000 / POLL_INTERVAL_MS)

// ─── Component ────────────────────────────────────────────────────────────────

export function LocalVerification({ jobId, jobName, totalEmails, onComplete }: LocalVerificationProps) {
  const [logs, setLogs]           = useState<LogLine[]>([])
  const [running, setRunning]     = useState(false)
  const [processed, setProcessed] = useState(0)
  const [progress, setProgress]   = useState(0)
  const stopRef                   = useRef(false)
  const terminalRef               = useRef<HTMLDivElement>(null)

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const log = useCallback((type: LogLine['type'], text: string) => {
    const ts = new Date().toLocaleTimeString('es-CL', { hour12: false })
    setLogs(prev => [...prev, { ts, type, text }])
  }, [])

  const clearLogs = () => setLogs([])

  // ── Main loop ──────────────────────────────────────────────────────────────

  const run = useCallback(async () => {
    stopRef.current = false
    setRunning(true)
    setProcessed(0)
    setProgress(0)
    clearLogs()

    log('info', `Iniciando verificación local — Job: ${jobName}`)
    log('dim',  `Chunk size: ${CHUNK_SIZE.toLocaleString()} · Timeout: ${MAX_POLL_SECONDS}s por batch`)

    let offset       = 0
    let totalDone    = 0
    let chunkIndex   = 0

    try {
      while (!stopRef.current) {
        // 1. Fetch next chunk of pending items
        log('dim', `Obteniendo chunk #${chunkIndex + 1} (offset=${offset.toLocaleString()})...`)
        const pendingRes = await fetch(
          `/api/verification/local/pending?job_id=${jobId}&limit=${CHUNK_SIZE}&offset=${offset}`
        )
        if (!pendingRes.ok) throw new Error(`Error obteniendo pendientes: ${pendingRes.status}`)
        const { items, total_pending } = await pendingRes.json()

        if (!items || items.length === 0) {
          log('success', 'No hay mas emails pendientes. Verificacion completada.')
          break
        }

        log('info', `Chunk #${chunkIndex + 1}: ${items.length.toLocaleString()} emails — ${total_pending.toLocaleString()} pendientes en total`)

        // 2. Submit chunk to mails.so
        log('dim', `Enviando a mails.so...`)
        const submitRes = await fetch('/api/verification/local/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, emails: items }),
        })
        if (!submitRes.ok) {
          const err = await submitRes.json()
          throw new Error(`Submit fallido: ${err.error ?? submitRes.status}`)
        }
        const { batch_id } = await submitRes.json()
        log('info', `Batch enviado — ID: ${batch_id}`)

        // 3. Poll until completed or timeout
        let polls       = 0
        let mailResults: { email: string; status: string }[] = []

        log('dim', `Esperando resultados (poll cada ${POLL_INTERVAL_MS / 1000}s, max ${MAX_POLL_SECONDS}s)...`)

        while (polls < MAX_POLLS) {
          if (stopRef.current) break

          await sleep(POLL_INTERVAL_MS)
          polls++

          const pollRes = await fetch(`/api/verification/local/poll?batch_id=${batch_id}`)
          if (!pollRes.ok) {
            log('warn', `Poll ${polls} falló (${pollRes.status}), reintentando...`)
            continue
          }
          const pollData = await pollRes.json()
          const { status, processed: pCount, total, results } = pollData

          const elapsed = (polls * POLL_INTERVAL_MS / 1000).toFixed(0)
          log('dim', `Poll ${polls} — status: ${status} · ${pCount ?? '?'}/${total ?? items.length} · ${elapsed}s`)

          if (status === 'completed') {
            mailResults = results ?? []
            log('success', `Batch completado — ${mailResults.length.toLocaleString()} resultados recibidos`)
            break
          }
        }

        if (polls >= MAX_POLLS && mailResults.length === 0) {
          log('error', `Timeout (${MAX_POLL_SECONDS}s) — batch_id: ${batch_id}. Saltando chunk.`)
          offset += CHUNK_SIZE
          chunkIndex++
          continue
        }

        if (stopRef.current) break

        // 4. Match results back to item IDs (by email)
        const emailToId = new Map(items.map((x: { id: string; email: string }) => [x.email.toLowerCase(), x.id]))
        const saveItems = mailResults
          .map((r: { email: string; status: string }) => ({
            id:     emailToId.get(r.email.toLowerCase()),
            email:  r.email,
            status: r.status,
          }))
          .filter((x: { id: unknown }) => x.id)

        log('dim', `Guardando ${saveItems.length.toLocaleString()} resultados en DB...`)

        // 5. Save results in sub-chunks of 5k to avoid payload size issues
        const SAVE_CHUNK = 5000
        for (let i = 0; i < saveItems.length; i += SAVE_CHUNK) {
          if (stopRef.current) break
          const saveRes = await fetch('/api/verification/local/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: jobId, items: saveItems.slice(i, i + SAVE_CHUNK) }),
          })
          if (!saveRes.ok) {
            const err = await saveRes.json()
            log('warn', `Save parcial falló: ${err.error ?? saveRes.status}`)
          }
        }

        totalDone += saveItems.length
        setProcessed(totalDone)
        setProgress(Math.min(100, Math.round((totalDone / totalEmails) * 100)))

        // Count results per status
        const counts = mailResults.reduce((acc: Record<string, number>, r: { status: string }) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1
          return acc
        }, {})
        const summary = Object.entries(counts).map(([k, v]) => `${k}: ${(v as number).toLocaleString()}`).join(' · ')
        log('success', `Guardado. Resumen: ${summary}`)
        log('dim',     `Progreso total: ${totalDone.toLocaleString()} / ${totalEmails.toLocaleString()} (${Math.round((totalDone / totalEmails) * 100)}%)`)

        offset = 0 // reset offset — pending query always returns from top
        chunkIndex++
      }

      if (stopRef.current) {
        log('warn', 'Verificacion detenida manualmente.')
      } else {
        log('success', `Verificacion local finalizada. Total procesado: ${totalDone.toLocaleString()}`)
        onComplete?.()
      }
    } catch (err: unknown) {
      log('error', `Error: ${(err as Error).message}`)
    } finally {
      setRunning(false)
    }
  }, [jobId, jobName, totalEmails, log, onComplete])

  const stop = () => {
    stopRef.current = true
    log('warn', 'Deteniendo... (el chunk actual terminara antes de parar)')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        {!running ? (
          <Button size="sm" onClick={run} className="bg-foreground text-background hover:bg-foreground/90">
            Iniciar verificacion local
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={stop}>
            Detener
          </Button>
        )}
        {logs.length > 0 && !running && (
          <Button size="sm" variant="ghost" onClick={clearLogs}>
            Limpiar consola
          </Button>
        )}
        {running && (
          <span className="text-xs text-muted-foreground">
            {processed.toLocaleString()} / {totalEmails.toLocaleString()} procesados
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(running || progress > 0) && (
        <Progress value={progress} className="h-1.5" />
      )}

      {/* Terminal */}
      {logs.length > 0 && (
        <div
          ref={terminalRef}
          className="bg-[#0d0d0d] rounded-lg border border-white/10 p-3 h-72 overflow-y-auto font-mono text-xs leading-5 select-text"
        >
          {logs.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-white/30 shrink-0">{line.ts}</span>
              <span className={logColor(line.type)}>{line.text}</span>
            </div>
          ))}
          {running && (
            <div className="flex gap-2 mt-1">
              <span className="text-white/30 shrink-0">{new Date().toLocaleTimeString('es-CL', { hour12: false })}</span>
              <span className="text-white/40 animate-pulse">_</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function logColor(type: LogLine['type']): string {
  switch (type) {
    case 'success': return 'text-green-400'
    case 'error':   return 'text-red-400'
    case 'warn':    return 'text-yellow-400'
    case 'dim':     return 'text-white/40'
    default:        return 'text-white/90'
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
