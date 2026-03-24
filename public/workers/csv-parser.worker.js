/**
 * CSV / Excel parser Web Worker — optimized for 1M+ rows
 *
 * Key optimizations:
 *  - Processes in chunks of 20k lines, yielding between chunks so the worker
 *    stays responsive and posts progress updates regularly.
 *  - Batch size raised to 5000 rows (10x less network roundtrips vs 500).
 *  - Uses a plain object map instead of Set for dedup (faster for large sets).
 *
 * Messages received:
 *   { type: 'parse', file: File }
 *
 * Messages sent:
 *   { type: 'progress', parsed: number, total: number }
 *   { type: 'batch',    rows: [{email, first_name, last_name}] }
 *   { type: 'done',     total: number, duplicates: number }
 *   { type: 'error',    message: string }
 */

const BATCH_SIZE  = 5000   // rows per batch sent to server
const CHUNK_LINES = 20000  // lines processed before yielding to keep worker alive
const EMAIL_RE    = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const cols = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote; continue }
    if ((ch === ',' || ch === ';' || ch === '\t') && !inQuote) {
      cols.push(cur.trim()); cur = ''; continue
    }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

function detectEmailColIndex(headerCols) {
  for (let i = 0; i < headerCols.length; i++) {
    if (/email|correo|e-mail/i.test(headerCols[i])) return i
  }
  return -1
}

function detectNameCols(headerCols) {
  let first = -1, last = -1
  for (let i = 0; i < headerCols.length; i++) {
    if (/first.?name|nombre|first/i.test(headerCols[i])) first = i
    if (/last.?name|apellido|last/i.test(headerCols[i])) last = i
  }
  return { first, last }
}

// Yield control back to the event loop between chunks
function yieldToEventLoop() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

// ─── main ────────────────────────────────────────────────────────────────────

// Shared state between 'preview' and 'parse' messages
let _lines = null
let _hasHeader = false

self.onmessage = async (e) => {
  // ── PHASE 1: preview — read headers + sample rows so user can map columns ──
  if (e.data.type === 'preview') {
    const file = e.data.file
    try {
      let text
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'xlsx' || ext === 'xls') {
        try {
          self.importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js')
          const buf = await file.arrayBuffer()
          const wb  = XLSX.read(buf, { type: 'array', dense: true })
          const ws  = wb.Sheets[wb.SheetNames[0]]
          text = XLSX.utils.sheet_to_csv(ws)
        } catch {
          self.postMessage({ type: 'error', message: 'No se pudo procesar el archivo Excel. Intenta exportarlo como CSV.' })
          return
        }
      } else {
        text = await file.text()
      }

      _lines = text.split(/\r?\n/)
      text = null

      const firstCols = parseCSVLine(_lines[0] || '')
      _hasHeader = firstCols.some(c => /email|correo|nombre|name|first|last|apellido|mail/i.test(c))

      // Auto-suggest column mapping
      const headers = _hasHeader ? firstCols : firstCols.map((_, i) => `Columna ${i + 1}`)
      const emailCol   = _hasHeader ? detectEmailColIndex(firstCols) : -1
      const nameCols   = _hasHeader ? detectNameCols(firstCols) : { first: -1, last: -1 }

      // Sample first 3 data rows for preview
      const startAt = _hasHeader ? 1 : 0
      const sample = []
      for (let i = startAt; i < Math.min(startAt + 3, _lines.length); i++) {
        const line = _lines[i].trim()
        if (line) sample.push(parseCSVLine(line))
      }

      self.postMessage({
        type: 'preview',
        headers,
        sample,
        suggested: { email: emailCol, first_name: nameCols.first, last_name: nameCols.last },
        totalLines: _lines.length - (startAt),
      })
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message || 'Error al leer el archivo' })
    }
    return
  }

  // ── PHASE 2: parse — do the actual import with confirmed column mapping ──
  if (e.data.type === 'parse') {
    // mapping: { email: colIndex, first_name: colIndex | -1, last_name: colIndex | -1 }
    const { mapping } = e.data

    // If _lines is null it means preview wasn't called (direct parse with file — legacy path)
    if (!_lines && e.data.file) {
      const file = e.data.file
      try {
        let text
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (ext === 'xlsx' || ext === 'xls') {
          try {
            self.importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js')
            const buf = await file.arrayBuffer()
            const wb  = XLSX.read(buf, { type: 'array', dense: true })
            const ws  = wb.Sheets[wb.SheetNames[0]]
            text = XLSX.utils.sheet_to_csv(ws)
          } catch {
            self.postMessage({ type: 'error', message: 'No se pudo procesar el archivo Excel.' })
            return
          }
        } else {
          text = await file.text()
        }
        _lines = text.split(/\r?\n/)
        text = null
        const firstCols = parseCSVLine(_lines[0] || '')
        _hasHeader = firstCols.some(c => /email|correo|nombre|name|first|last|apellido|mail/i.test(c))
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message || 'Error al leer el archivo' })
        return
      }
    }

    if (!_lines) {
      self.postMessage({ type: 'error', message: 'Primero envía el archivo en modo preview.' })
      return
    }

    const startAt = _hasHeader ? 1 : 0
    const total   = _lines.length - startAt
    const emailColIdx     = mapping?.email      ?? -1
    const firstNameColIdx = mapping?.first_name ?? -1
    const lastNameColIdx  = mapping?.last_name  ?? -1
    const fallback        = emailColIdx === -1

    const seen = Object.create(null)
    let duplicates = 0
    let totalValid = 0
    let batch = []

    for (let i = startAt; i < _lines.length; i++) {
      const line = _lines[i].trim()
      if (!line) continue

      const cols = parseCSVLine(line)
      let email = ''
      let first_name = null
      let last_name  = null

      if (!fallback) {
        email      = (cols[emailColIdx] || '').toLowerCase().trim()
        first_name = firstNameColIdx !== -1 ? (cols[firstNameColIdx] || null) : null
        last_name  = lastNameColIdx  !== -1 ? (cols[lastNameColIdx]  || null) : null
      } else {
        for (let c = 0; c < cols.length; c++) {
          const v = cols[c].trim()
          if (EMAIL_RE.test(v)) { email = v.toLowerCase(); break }
        }
        if (email && cols.length >= 3) {
          const nonEmail = cols.filter(c => !EMAIL_RE.test(c.trim()))
          first_name = nonEmail[0] || null
          last_name  = nonEmail[1] || null
        }
      }

      if (!email || !EMAIL_RE.test(email)) continue
      if (seen[email]) { duplicates++; continue }

      seen[email] = 1
      totalValid++
      batch.push({ email, first_name, last_name })

      if (batch.length === BATCH_SIZE) {
        self.postMessage({ type: 'batch', rows: batch })
        batch = []
      }

      if ((i - startAt) % CHUNK_LINES === 0 && i > startAt) {
        self.postMessage({ type: 'progress', parsed: i - startAt, total })
        await yieldToEventLoop()
      }
    }

    if (batch.length > 0) {
      self.postMessage({ type: 'batch', rows: batch })
    }

    self.postMessage({ type: 'done', total: totalValid, duplicates })

    // free memory
    _lines = null
    return
  }
}
