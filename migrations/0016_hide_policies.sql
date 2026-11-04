-- Policy documents stay off the public site until the CEO turns each one on.
ALTER TABLE policies ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
