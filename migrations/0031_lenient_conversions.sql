-- Add lenient postback setting per program
ALTER TABLE programs ADD COLUMN lenient_postbacks INTEGER NOT NULL DEFAULT 0;

-- Add warning flags to conversions
ALTER TABLE conversions ADD COLUMN warning_flags TEXT;
CREATE INDEX IF NOT EXISTS idx_conversions_warning ON conversions(program_id, warning_flags) WHERE warning_flags IS NOT NULL;
