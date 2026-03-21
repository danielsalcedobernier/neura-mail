import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const BATCH = 5000

async function main() {
  console.log('Step 1: Propagating verification results to email_list_contacts...')

  let offset = 0
  let totalUpdated = 0

  while (true) {
    const rows = await sql`
      SELECT vji.contact_id, vji.result, vji.processed_at
      FROM verification_job_items vji
      JOIN email_list_contacts elc ON elc.id = vji.contact_id
      WHERE vji.status = 'completed'
        AND vji.result IS NOT NULL
        AND elc.verification_status IN ('unverified', 'unknown')
      LIMIT ${BATCH}
      OFFSET ${offset}
    `

    if (rows.length === 0) break

    const payload = JSON.stringify(rows.map(r => ({
      contact_id: r.contact_id,
      result: r.result,
      processed_at: r.processed_at,
    })))

    const updated = await sql`
      UPDATE email_list_contacts elc
      SET
        verification_status = v.result,
        verified_at         = v.processed_at::timestamptz
      FROM json_to_recordset(${payload}::json) AS v(contact_id uuid, result text, processed_at text)
      WHERE elc.id = v.contact_id
    `

    totalUpdated += rows.length
    console.log(`  Updated ${totalUpdated} contacts so far...`)
    offset += BATCH
  }

  console.log(`Step 1 complete: ${totalUpdated} contacts updated`)

  console.log('Step 2: Re-syncing email_lists counters...')

  const lists = await sql`SELECT id, name FROM email_lists`

  for (const list of lists) {
    const [counts] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE verification_status IN ('valid', 'catch_all'))                              AS valid_count,
        COUNT(*) FILTER (WHERE verification_status = 'invalid')                                            AS invalid_count,
        COUNT(*) FILTER (WHERE verification_status IN ('unverified', 'unknown') OR verification_status IS NULL) AS unverified_count
      FROM email_list_contacts
      WHERE list_id = ${list.id}
    `

    await sql`
      UPDATE email_lists
      SET
        valid_count      = ${Number(counts.valid_count)},
        invalid_count    = ${Number(counts.invalid_count)},
        unverified_count = ${Number(counts.unverified_count)},
        verified_at      = NOW()
      WHERE id = ${list.id}
    `

    console.log(`  ${list.name}: ${counts.valid_count} válidos · ${counts.invalid_count} inválidos · ${counts.unverified_count} sin verificar`)
  }

  console.log('Done!')
}

main().catch(err => { console.error(err); process.exit(1) })
