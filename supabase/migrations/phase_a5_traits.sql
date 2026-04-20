-- Phase A.5 — add traits column for stable-trait persistence
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS traits JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.traits IS 'Stable diagnostic traits locked from scans. Shape: { face_shape: { value, confidence, locked_at, source }, hair_texture: {...}, skin_undertone: {...} }. Source: first_scan_auto | user_confirmed | overridden.';
