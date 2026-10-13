-- Team invites must be explicitly accepted before they grant account access.
-- Existing rows stay pending (NULL) so invitees re-confirm membership.
ALTER TABLE team_members ADD COLUMN accepted_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_team_members_email_accepted ON team_members(email, accepted_at);

-- Campaign keys resolve /c/{key} without a user scope, so they must be globally unique.
-- Rewrite any cross-account duplicates (keep the oldest row) before adding the index.
UPDATE programs
SET campaign_key = campaign_key || '_' || id
WHERE campaign_key IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM programs AS other
    WHERE other.campaign_key = programs.campaign_key
      AND other.rowid < programs.rowid
  );

DROP INDEX IF EXISTS idx_programs_campaign_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_campaign_key_global
  ON programs(campaign_key) WHERE campaign_key IS NOT NULL;
