-- Add api_key column to users table if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS api_key TEXT;
