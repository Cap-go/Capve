-- Confirmed account identity. Other hosted accounts and self-hosted installs are unchanged.
UPDATE account_billing
SET trial_started_at = unixepoch() * 1000,
    trial_ends_at = unixepoch('now', '+3 years') * 1000
WHERE account_id = 'usr_f26ae7acc0337df4'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = account_billing.account_id
      AND lower(users.email) = 'team.mediapath@gmail.com'
  );
