-- Comped accounts: no click allowance and no trial expiry. Granted only by reviewed migration.
ALTER TABLE account_billing ADD COLUMN unlimited INTEGER NOT NULL DEFAULT 0 CHECK (unlimited IN (0, 1));

-- Medialab, the confirmed beta customer. Both id and email must match.
UPDATE account_billing SET unlimited = 1
WHERE account_id = 'usr_f26ae7acc0337df4'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = account_billing.account_id
      AND lower(users.email) = 'team.mediapath@gmail.com'
  );
