-- Step 1: Propagate verified results from job items back to contacts (batch by list)
UPDATE email_list_contacts elc
SET
  verification_status = vji.result,
  verified_at         = vji.processed_at
FROM verification_job_items vji
WHERE vji.contact_id = elc.id
  AND vji.status     = 'completed'
  AND vji.result     IS NOT NULL
  AND elc.verification_status IN ('unverified', 'unknown');

-- Step 2: Re-sync email_lists counters with correct status values
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
    COUNT(*) FILTER (WHERE verification_status = 'invalid')                                            AS invalid_count,
    COUNT(*) FILTER (WHERE verification_status IN ('unverified', 'unknown') OR verification_status IS NULL) AS unverified_count
  FROM email_list_contacts
  GROUP BY list_id
) counts
WHERE el.id = counts.list_id;
