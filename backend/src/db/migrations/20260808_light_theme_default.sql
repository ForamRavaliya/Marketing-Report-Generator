-- Changes the product's default UI theme from 'system' to 'light' for
-- newly created users only. Does NOT touch any existing user's stored
-- ui_theme value -- an existing 'system'/'light'/'dark' row is treated as
-- an explicit, respected preference and is left exactly as it is.
--
-- SAFETY: ALTER COLUMN ... SET DEFAULT only changes what future INSERTs
-- receive when they omit the column; it does not rewrite any existing row.
-- This is a pure schema change, no data is modified.
ALTER TABLE users ALTER COLUMN ui_theme SET DEFAULT 'light';
