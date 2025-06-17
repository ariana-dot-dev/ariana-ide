use sqlx::{Pool, Sqlite, SqlitePool, migrate::MigrateError};
use uuid::Uuid;
use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    pub account_id: String, // Store as String for SQLite compatibility
    pub email: String,
    pub created_at: String, // Store as String for SQLite compatibility
}

pub async fn create_pool(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    SqlitePool::connect(database_url).await
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

impl Account {
    pub async fn create_or_get(pool: &Pool<Sqlite>, email: &str) -> Result<Self, sqlx::Error> {
        // Try to find existing account
        let existing = sqlx::query!(
            "SELECT account_id, email, created_at FROM accounts WHERE email = ?",
            email
        )
        .fetch_optional(pool)
        .await?;

        if let Some(row) = existing {
            return Ok(Account {
                account_id: row.account_id.unwrap_or_default(),
                email: row.email,
                created_at: row.created_at,
            });
        }

        // Create new account
        let account_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        sqlx::query!(
            "INSERT INTO accounts (account_id, email, created_at) VALUES (?, ?, ?)",
            account_id,
            email,
            now
        )
        .execute(pool)
        .await?;

        Ok(Account {
            account_id,
            email: email.to_string(),
            created_at: now,
        })
    }

    pub async fn get_by_email(pool: &Pool<Sqlite>, email: &str) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query!(
            "SELECT account_id, email, created_at FROM accounts WHERE email = ?",
            email
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Account {
            account_id: r.account_id.unwrap_or_default(),
            email: r.email,
            created_at: r.created_at,
        }))
    }
}
