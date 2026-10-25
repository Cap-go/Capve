-- Serialize all subscription, invoice and Checkout reconciliation snapshots.
-- Keep this revision independent of Stripe's subscription-event timestamp.
ALTER TABLE account_billing ADD COLUMN reconciliation_revision INTEGER NOT NULL DEFAULT 0;
