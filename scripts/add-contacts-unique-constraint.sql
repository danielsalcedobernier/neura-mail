-- Remove duplicate (list_id, email) rows keeping the most recent one
DELETE FROM email_list_contacts a
USING email_list_contacts b
WHERE a.id < b.id
  AND a.list_id = b.list_id
  AND a.email = b.email;

-- Add unique constraint so ON CONFLICT (list_id, email) works
ALTER TABLE email_list_contacts
  ADD CONSTRAINT email_list_contacts_list_id_email_key UNIQUE (list_id, email);
