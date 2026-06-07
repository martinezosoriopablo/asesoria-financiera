-- Allow meetings without a client (e.g. reminders)
-- Drop NOT NULL constraint on client_id in meetings table
ALTER TABLE meetings ALTER COLUMN client_id DROP NOT NULL;
