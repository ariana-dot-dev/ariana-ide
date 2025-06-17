-- Create login_codes table
CREATE TABLE login_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email and code for faster lookups
CREATE INDEX idx_login_codes_email ON login_codes(email);
CREATE INDEX idx_login_codes_code ON login_codes(code);
CREATE INDEX idx_login_codes_expires_at ON login_codes(expires_at);
