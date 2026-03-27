import pg from 'pg'
const { Pool } = pg

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const tables = [
  'verification_jobs',
  'verification_job_items',
  'global_email_cache',
  'email_list_contacts',
]

for (const table of tables) {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table])
    console.log(`\n=== ${table} ===`)
    for (const row of res.rows) {
      console.log(`  ${row.column_name} (${row.data_type}) ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`)
    }
  } catch (e) {
    console.log(`ERROR en ${table}: ${e.message}`)
  }
}

await pool.end()
