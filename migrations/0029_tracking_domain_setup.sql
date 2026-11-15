-- Automatic tracking domain setup through Cloudflare for SaaS custom hostnames.
-- cf_hostname_id is NULL for domains set up by hand (self-hosted installs without automatic setup).
ALTER TABLE tracking_domains ADD COLUMN cf_hostname_id TEXT;
-- Last seen Cloudflare hostname and certificate status, and its verification errors (JSON array).
ALTER TABLE tracking_domains ADD COLUMN cf_status TEXT;
ALTER TABLE tracking_domains ADD COLUMN cf_ssl_status TEXT;
ALTER TABLE tracking_domains ADD COLUMN cf_errors TEXT;
ALTER TABLE tracking_domains ADD COLUMN checked_at INTEGER;
-- Held by the one request removing the domain (a random token and when it was taken); status checks
-- don't save to the row while it is set. A claim older than 10 minutes can be taken over.
ALTER TABLE tracking_domains ADD COLUMN removal_claim TEXT;
ALTER TABLE tracking_domains ADD COLUMN deleting_at INTEGER;

-- Custom hostnames being deleted because no domain uses them (removed mid-setup). A cleanup claims
-- its row before deleting; a domain can't save a hostname while it is claimed. Rows left after a
-- failed deletion are retried hourly.
CREATE TABLE IF NOT EXISTS tracking_domain_cleanup (
  cf_hostname_id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  claim TEXT,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);
