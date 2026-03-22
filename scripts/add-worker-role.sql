ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role = ANY (ARRAY['admin', 'client', 'worker']));
