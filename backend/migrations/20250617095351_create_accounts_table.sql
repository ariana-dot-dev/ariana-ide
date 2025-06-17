-- Create accounts table
CREATE TABLE accounts (
    account_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);

-- Create index on email for faster lookups
CREATE INDEX idx_accounts_email ON accounts(email);
