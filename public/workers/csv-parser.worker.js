/**
 * CSV / Excel parser Web Worker
 * Runs off the main thread so the UI never freezes with 5M+ rows.
 *
 * Messages received:
 *   { type: 'parse', file: File }
 *
 * Messages sent:
 *   { type: 'progress', parsed: number, total: number }
 *   { type: 'batch',    rows: [{email, first_name, last_name}] }  (BATCH_SIZE rows)
 *   { type: 'done',     total: number, duplicates: number }
 *   { type: 'error',    message: string }
 */

const BATCH_SIZE = 500
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

// --- helpers ----------------------------------------------------------------

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

// --- main -------------------------------------------------------------------

self.onmessage = async (e) => {
  if (e.data.type !== 'parse') return

  const file = e.data.file

  try {
    // Read file as text (works for CSV/TXT; Excel .xlsx needs different handling)
    let text
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      // For Excel we import SheetJS from CDN inside the worker
      try {
        self.importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js')
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        text = XLSX.utils.sheet_to_csv(ws)
      } catch {
        self.postMessage({ type: 'error', message: 'No se pudo procesar el archivo Excel. Intenta exportarlo como CSV.' })
        return
      }
    } else {
      text = await file.text()
    }

    const lines = text.split(/\r?\n/)
    const total = lines.length
    const seen = new Set()
    let duplicates = 0
    let totalValid = 0
    let batch = []

    // Detect header
    const firstLine = parseCSVLine(lines[0] || '')
    const hasHeader = firstLine.some(c => /email|correo|nombre|name|first|last/i.test(c))
    let emailCol = hasHeader ? detectEmailColIndex(firstLine) : -1
    let nameCols = hasHeader ? detectNameCols(firstLine) : { first: -1, last: -1 }
    const startAt = hasHeader ? 1 : 0

    // If no email column found in header, fall back to scanning each row
    const fallback = emailCol === -1

    for (let i = startAt; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = parseCSVLine(line)
      let email = ''
      let first_name = null
      let last_name = null

      if (!fallback && emailCol !== -1) {
        email = (cols[emailCol] || '').toLowerCase().trim()
        first_name = nameCols.first !== -1 ? cols[nameCols.first] || null : null
        last_name  = nameCols.last  !== -1 ? cols[nameCols.last]  || null : null
      } else {
        // Scan columns for an email
        for (let c = 0; c < cols.length; c++) {
          const v = cols[c].trim()
          if (EMAIL_RE.test(v)) { email = v.toLowerCase(); break }
        }
        // Best-effort: if exactly one col is email and ≥3 cols, guess names
        if (email && cols.length >= 3) {
          const nonEmail = cols.filter(c => !EMAIL_RE.test(c.trim()))
          first_name = nonEmail[0] || null
          last_name  = nonEmail[1] || null
        }
      }

      if (!email || !EMAIL_RE.test(email)) continue
      if (seen.has(email)) { duplicates++; continue }

      seen.add(email)
      totalValid++
      batch.push({ email, first_name, last_name })

      if (batch.length === BATCH_SIZE) {
        self.postMessage({ type: 'batch', rows: batch })
        batch = []
      }

      // Progress every 2000 rows
      if ((i - startAt) % 2000 === 0) {
        self.postMessage({ type: 'progress', parsed: i - startAt, total: total - startAt })
      }
    }

    // Flush remaining
    if (batch.length > 0) self.postMessage({ type: 'batch', rows: batch })

    self.postMessage({ type: 'done', total: totalValid, duplicates })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'Error al parsear el archivo' })
  }
}
