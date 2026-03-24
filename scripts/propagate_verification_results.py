# /// script
# requires-python = ">=3.11"
# dependencies = ["pg8000"]
# ///
import os, urllib.parse
import pg8000.native

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""
if not DATABASE_URL:
    raise Exception("No DATABASE_URL found")

parsed   = urllib.parse.urlparse(DATABASE_URL)
host     = parsed.hostname
port     = parsed.port or 5432
user     = parsed.username
password = urllib.parse.unquote(parsed.password or "")
dbname   = parsed.path.lstrip("/")

con = pg8000.native.Connection(
    host=host, port=port, user=user, password=password, database=dbname,
    ssl_context=True
)

BATCH_SIZE    = 5000
offset        = 0
total_updated = 0

print("[v0] Step 1: Propagating verification_job_items → email_list_contacts...")

while True:
    rows = con.run(f"""
        WITH batch AS (
          SELECT vji.contact_id, vji.result
          FROM verification_job_items vji
          WHERE vji.status = 'completed'
            AND vji.result IS NOT NULL
            AND vji.contact_id IS NOT NULL
          ORDER BY vji.contact_id
          LIMIT {BATCH_SIZE} OFFSET {offset}
        )
        UPDATE email_list_contacts elc
        SET verification_status = batch.result,
            verified_at = NOW()
        FROM batch
        WHERE elc.id = batch.contact_id
          AND elc.verification_status IN ('unverified', 'unknown')
        RETURNING elc.id
    """)
    updated = len(rows)
    total_updated += updated
    print(f"[v0] offset={offset} | updated={updated} | total={total_updated}")
    if updated < BATCH_SIZE:
        break
    offset += BATCH_SIZE

print(f"[v0] Propagation done. Total contacts updated: {total_updated}")

print("[v0] Step 2: Syncing email_lists counters...")
rows = con.run("""
    UPDATE email_lists el
    SET
      valid_count      = counts.valid_count,
      invalid_count    = counts.invalid_count,
      unverified_count = counts.unverified_count,
      verified_at      = NOW()
    FROM (
      SELECT
        list_id,
        COUNT(*) FILTER (WHERE verification_status IN ('valid', 'catch_all'))                              AS valid_count,
        COUNT(*) FILTER (WHERE verification_status = 'invalid')                                           AS invalid_count,
        COUNT(*) FILTER (WHERE verification_status IN ('unverified', 'unknown') OR verification_status IS NULL) AS unverified_count
      FROM email_list_contacts
      GROUP BY list_id
    ) counts
    WHERE el.id = counts.list_id
    RETURNING el.name, el.valid_count, el.invalid_count, el.unverified_count
""")
for row in rows:
    print(f"[v0] '{row[0]}': valid={row[1]} invalid={row[2]} unverified={row[3]}")

con.close()
print("[v0] All done.")
