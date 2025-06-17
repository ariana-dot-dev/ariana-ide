use actix_cors::Cors;
use actix_web::{
    get,
    middleware::{Logger, NormalizePath},
    web::{self, Data},
    App, HttpServer, Responder,
};
use dotenvy::dotenv;
use log::info;
use std::env;

mod auth;
mod database;
mod email;

#[get("/ping")]
async fn ping() -> impl Responder {
    "pong"
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    
    // Initialize logging
    fern::Dispatch::new()
        .level(log::LevelFilter::Info)
        .chain(std::io::stdout())
        .apply()
        .expect("Failed to initialize logging");

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = database::create_pool(&database_url).await
        .expect("Failed to create database pool");
    
    // Run migrations
    database::run_migrations(&pool).await
        .expect("Failed to run migrations");

    let email_service = email::EmailService::new()
        .expect("Failed to initialize email service");

    let port = env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid number");

    info!("Starting server on port {}", port);

    HttpServer::new(move || {
        App::new()
            .app_data(Data::new(pool.clone()))
            .app_data(Data::new(email_service.clone()))
            .wrap(NormalizePath::trim())
            .wrap(Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_header()
                    .allow_any_method()
                    .allow_any_origin(),
            )
            .service(ping)
            .service(
                web::scope("/auth")
                    .service(auth::request_login_code)
                    .service(auth::validate_login_code),
            )
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}
