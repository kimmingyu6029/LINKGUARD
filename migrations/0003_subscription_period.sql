ALTER TABLE users ADD COLUMN plan_billing TEXT;
ALTER TABLE users ADD COLUMN plan_started_at TEXT;
ALTER TABLE users ADD COLUMN plan_expires_at TEXT;

ALTER TABLE wallet_transactions ADD COLUMN subscription_started_at TEXT;
ALTER TABLE wallet_transactions ADD COLUMN subscription_expires_at TEXT;
