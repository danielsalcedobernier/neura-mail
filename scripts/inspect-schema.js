import pg from 'pg'

const { Client } = pg
const client = new Client({ connectionString: process.env.DATABASE_URL })

await client.connect()

const tables = ['verification_jobs', 'verification_job_items', 'global_email_cache', 'email_list_contacts']

for (const table of tables) {
  const res = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [table])
  console.log(`\n=== ${table} ===`)
  for (const row of res.rows) {
    console.log(`  ${row.column_name} (${row.data_type}) nullable=${row.is_nullable}`)
  }
}

await client.end()
