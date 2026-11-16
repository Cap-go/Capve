-- Add lenient postback setting per program (default ON)
ALTER TABLE programs ADD COLUMN lenient_postbacks INTEGER NOT NULL DEFAULT 1;

-- Set existing programs to lenient mode
UPDATE programs SET lenient_postbacks = 1;

-- Add warning flags to conversions
ALTER TABLE conversions ADD COLUMN warning_flags TEXT;
CREATE INDEX IF NOT EXISTS idx_conversions_warning ON conversions(program_id, warning_flags) WHERE warning_flags IS NOT NULL;
