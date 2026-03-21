-- Sync valid_count, invalid_count, unverified_count from email_list_contacts to email_lists
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
    COUNT(*) FILTER (WHERE verification_status = 'invalid')              AS invalid_count,
    COUNT(*) FILTER (WHERE verification_status IS NULL
                       OR  verification_status = 'unknown')              AS unverified_count
  FROM email_list_contacts
  GROUP BY list_id
) counts
WHERE el.id = counts.list_id;
