-- Automatic tracking domain setup through Cloudflare for SaaS custom hostnames.
-- cf_hostname_id is NULL for domains set up by hand (self-hosted installs without automatic setup).
ALTER TABLE tracking_domains ADD COLUMN cf_hostname_id TEXT;
-- Last seen Cloudflare hostname and certificate status, and its verification errors (JSON array).
ALTER TABLE tracking_domains ADD COLUMN cf_status TEXT;
ALTER TABLE tracking_domains ADD COLUMN cf_ssl_status TEXT;
ALTER TABLE tracking_domains ADD COLUMN cf_errors TEXT;
ALTER TABLE tracking_domains ADD COLUMN checked_at INTEGER;
