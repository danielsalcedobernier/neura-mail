import os
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
if not DATABASE_URL:
    raise Exception("No DATABASE_URL found in environment")

conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = False
cur = conn.cursor()

BATCH_SIZE = 5000
offset = 0
total_updated = 0

print("[v0] Starting propagation from verification_job_items → email_list_contacts")

while True:
    # Fetch a batch of completed job items
    cur.execute("""
        SELECT vji.contact_id, vji.result, vji.processed_at
        FROM verification_job_items vji
        WHERE vji.status = 'completed'
          AND vji.result IS NOT NULL
          AND vji.contact_id IS NOT NULL
        ORDER BY vji.contact_id
        LIMIT %s OFFSET %s
    """, (BATCH_SIZE, offset))

    rows = cur.fetchall()
    if not rows:
        print(f"[v0] No more rows at offset {offset}. Done.")
        break

    # Build update values
    values = [(row[1], row[2], row[0]) for row in rows]

    cur.executemany("""
        UPDATE email_list_contacts
        SET verification_status = %s,
            verified_at = %s
        WHERE id = %s
          AND verification_status IN ('unverified', 'unknown')
    """, values)

    updated = cur.rowcount
    conn.commit()
    total_updated += updated
    offset += BATCH_SIZE
    print(f"[v0] Batch offset={offset} | updated={updated} | total={total_updated}")

print(f"[v0] Propagation complete. Total contacts updated: {total_updated}")

# Now sync the counters in email_lists
print("[v0] Syncing email_lists counters...")
cur.execute("""
    UPDATE email_lists el
    SET
      valid_count      = counts.valid_count,
      invalid_count    = counts.invalid_count,
      unverified_count = counts.unverified_count,
      verified_at      = NOW()
    FROM (
      SELECT
        list_id,
        COUNT(*) FILTER (WHERE verification_status IN ('valid', 'catch_all')) AS valid_count,
        COUNT(*) FILTER (WHERE verification_status = 'invalid')               AS invalid_count,
        COUNT(*) FILTER (WHERE verification_status IN ('unverified', 'unknown') OR verification_status IS NULL) AS unverified_count
      FROM email_list_contacts
      GROUP BY list_id
    ) counts
    WHERE el.id = counts.list_id
    RETURNING el.name, el.valid_count, el.invalid_count, el.unverified_count
""")
lists = cur.fetchall()
conn.commit()

for row in lists:
    print(f"[v0] List '{row[0]}': valid={row[1]}, invalid={row[2]}, unverified={row[3]}")

cur.close()
conn.close()
print("[v0] All done.")
