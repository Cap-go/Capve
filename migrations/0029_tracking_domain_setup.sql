-- Automatic tracking domain setup through Cloudflare for SaaS custom hostnames.
-- cf_hostname_id is NULL for domains set up by hand (self-hosted installs without automatic setup).
ALTER TABLE tracking_domains ADD COLUMN cf_hostname_id TEXT;
-- Last seen Cloudflare hostname and certificate status, and its verification errors (JSON array).
ALTER TABLE tracking_domains ADD COLUMN cf_status TEXT;
ALTER TABLE tracking_domains ADD COLUMN cf_ssl_status TEXT;
ALTER TABLE tracking_domains ADD COLUMN cf_errors TEXT;
ALTER TABLE tracking_domains ADD COLUMN checked_at INTEGER;
-- Set while a removal deletes the Cloudflare hostname; status checks then stop saving to the row.
ALTER TABLE tracking_domains ADD COLUMN deleting_at INTEGER;

-- Custom hostnames left without a domain (removed mid-setup) whose deletion failed. Retried hourly.
CREATE TABLE IF NOT EXISTS tracking_domain_cleanup (
  cf_hostname_id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
