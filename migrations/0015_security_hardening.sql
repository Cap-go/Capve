-- Session revocation: sessions carry the version they were issued with; bumping it
-- (password reset, "log out everywhere") invalidates every older session.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- Per-account incoming postback key (`/click?...&key=`). Enforcement is opt-in so
-- live integrations keep working; without a valid key payouts are capped to the offer payout.
ALTER TABLE users ADD COLUMN postback_key TEXT;
ALTER TABLE users ADD COLUMN postback_key_required INTEGER NOT NULL DEFAULT 0;
