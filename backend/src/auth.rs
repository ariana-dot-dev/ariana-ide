use crate::{database::Account, email::EmailService};
use actix_web::{
	post,
	web::{self, Json},
	HttpResponse,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use log::error;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::env;

use validator::Validate;

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct RequestLoginCodeRequest {
	#[validate(email)]
	pub email: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestLoginCodeResponse {
	pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateLoginCodeRequest {
	pub email: String,
	pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
	pub token: String,
	pub account: Account,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
	sub: String, // account_id as string
	email: String,
	exp: i64, // expiration time
}

fn generate_login_code() -> String {
	let mut rng = rand::thread_rng();
	let code: String = (0..6).map(|_| rng.gen_range(0..10).to_string()).collect();
	code
}

#[post("/request-login-code")]
pub async fn request_login_code(
	pool: web::Data<SqlitePool>,
	email_service: web::Data<EmailService>,
	req: Json<RequestLoginCodeRequest>,
) -> Result<HttpResponse, actix_web::Error> {
	// Validate input
	if let Err(e) = req.validate() {
		return Ok(HttpResponse::BadRequest().json(format!("Invalid email: {}", e)));
	}

	// Create or get account
	let _account = Account::create_or_get(pool.get_ref(), &req.email)
		.await
		.map_err(|e| {
			error!("Database error: {}", e);
			actix_web::error::ErrorInternalServerError("Internal server error")
		})?;

	// Generate and store login code
	let login_code = generate_login_code();
	let expiry_hours: i64 = env::var("EMAIL_VERIFICATION_EXPIRY_HOURS")
		.unwrap_or_else(|_| "24".to_string())
		.parse()
		.unwrap_or(24);

	let expires_at = Utc::now() + Duration::hours(expiry_hours);
	let expires_at_str = expires_at.to_rfc3339();

	// Clean up old codes for this email
	sqlx::query!("DELETE FROM login_codes WHERE email = ?", req.email)
		.execute(pool.get_ref())
		.await
		.map_err(|e| {
			error!("Database error: {}", e);
			actix_web::error::ErrorInternalServerError("Failed to clean up old codes")
		})?;

	// Insert new code
	sqlx::query!(
		"INSERT INTO login_codes (email, code, expires_at) VALUES (?, ?, ?)",
		req.email,
		login_code,
		expires_at_str,
	)
	.execute(pool.get_ref())
	.await
	.map_err(|e| {
		error!("Database error: {}", e);
		actix_web::error::ErrorInternalServerError("Failed to create login code")
	})?;

	// Send login code email
	if let Err(e) = email_service
		.send_login_code_email(&req.email, &login_code)
		.await
	{
		error!("Failed to send login code email: {}", e);
		return Ok(HttpResponse::InternalServerError()
			.json("Failed to send login code email. Please try again later."));
	}

	Ok(HttpResponse::Ok().json(RequestLoginCodeResponse {
		message: "Login code sent successfully. Please check your email.".to_string(),
	}))
}

#[post("/validate-login-code")]
pub async fn validate_login_code(
	pool: web::Data<SqlitePool>,
	req: Json<ValidateLoginCodeRequest>,
) -> Result<HttpResponse, actix_web::Error> {
	// Get and validate login code
	let code_record = sqlx::query!(
		"SELECT email FROM login_codes 
         WHERE code = ? AND email = ? AND datetime(expires_at) > datetime('now')",
		req.code,
		req.email
	)
	.fetch_optional(pool.get_ref())
	.await
	.map_err(|e| {
		error!("Database error: {}", e);
		actix_web::error::ErrorInternalServerError("Internal server error")
	})?;

	if code_record.is_none() {
		return Ok(HttpResponse::BadRequest().json("Invalid or expired login code"));
	}

	// Get account
	let account = Account::get_by_email(pool.get_ref(), &req.email)
		.await
		.map_err(|e| {
			error!("Database error: {}", e);
			actix_web::error::ErrorInternalServerError("Failed to get account")
		})?
		.ok_or_else(|| {
			error!("Account not found for email: {}", req.email);
			actix_web::error::ErrorInternalServerError("Account not found")
		})?;

	// Generate JWT with 3 months expiration
	let expiration = Utc::now() + Duration::days(90); // 3 months
	let claims = Claims {
		sub: account.account_id.clone(),
		email: account.email.clone(),
		exp: expiration.timestamp(),
	};

	let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");

	let token = encode(
		&Header::default(),
		&claims,
		&EncodingKey::from_secret(jwt_secret.as_bytes()),
	)
	.map_err(|e| {
		error!("Token generation error: {}", e);
		actix_web::error::ErrorInternalServerError("Authentication error")
	})?;

	// Clean up used login code
	sqlx::query!("DELETE FROM login_codes WHERE code = ?", req.code)
		.execute(pool.get_ref())
		.await
		.map_err(|e| {
			error!("Database error: {}", e);
			actix_web::error::ErrorInternalServerError("Failed to clean up login code")
		})?;

	Ok(HttpResponse::Ok().json(AuthResponse { token, account }))
}
