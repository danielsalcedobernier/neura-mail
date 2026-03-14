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

self.onmessage = async (e) => {
  if (e.data.type !== 'parse') return

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

    // Split into lines — for very large files avoid keeping two giant strings
    const lines = text.split(/\r?\n/)
    text = null  // free memory ASAP

    const total = lines.length

    // Detect header on first line
    const firstCols = parseCSVLine(lines[0] || '')
    const hasHeader  = firstCols.some(c => /email|correo|nombre|name|first|last/i.test(c))
    const emailCol   = hasHeader ? detectEmailColIndex(firstCols) : -1
    const nameCols   = hasHeader ? detectNameCols(firstCols) : { first: -1, last: -1 }
    const startAt    = hasHeader ? 1 : 0
    const fallback   = emailCol === -1

    // Use a plain object as a seen-map — faster than Set for millions of keys
    const seen = Object.create(null)
    let duplicates = 0
    let totalValid = 0
    let batch = []

    for (let i = startAt; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = parseCSVLine(line)
      let email = ''
      let first_name = null
      let last_name  = null

      if (!fallback && emailCol !== -1) {
        email      = (cols[emailCol] || '').toLowerCase().trim()
        first_name = nameCols.first !== -1 ? (cols[nameCols.first] || null) : null
        last_name  = nameCols.last  !== -1 ? (cols[nameCols.last]  || null) : null
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

      // Every CHUNK_LINES rows: yield to event loop + send progress
      if ((i - startAt) % CHUNK_LINES === 0 && i > startAt) {
        self.postMessage({ type: 'progress', parsed: i - startAt, total: total - startAt })
        await yieldToEventLoop()
      }
    }

    // Flush last partial batch
    if (batch.length > 0) {
      self.postMessage({ type: 'batch', rows: batch })
    }

    self.postMessage({ type: 'done', total: totalValid, duplicates })

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Error al parsear el archivo' })
  }
}
