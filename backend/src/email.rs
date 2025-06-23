use lettre::{
    transport::smtp::authentication::Credentials, AsyncSmtpTransport, AsyncTransport, Message,
    Tokio1Executor,
};
use std::env;

#[derive(Clone)]
pub struct EmailService {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    sender_email: String,
}

impl EmailService {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let smtp_server = env::var("SMTP_SERVER")?;
        let smtp_port = env::var("SMTP_PORT")?.parse::<u16>()?;
        let smtp_username = env::var("SMTP_USERNAME")?;
        let smtp_password = env::var("SMTP_PASSWORD")?;
        let sender_email = env::var("SENDER_EMAIL")?;

        let creds = Credentials::new(smtp_username, smtp_password);

        // i had runtime errors with normal `relay` and this worked for me.
        // i used the email service `[resend](http://resend.com/)`
        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&smtp_server)?
            .port(smtp_port)
            .credentials(creds)
            .build();

        Ok(EmailService {
            transport,
            sender_email,
        })
    }

    pub async fn send_login_code_email(
        &self,
        to_email: &str,
        login_code: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let email = Message::builder()
            .from(self.sender_email.parse()?)
            .to(to_email.parse()?)
            .subject("Your ariana Login Code")
            .body(format!(
                "Hello!\n\nYour one-time login code for ariana IDE is: {}\n\nThis code will expire in 24 hours.\n\nIf you did not request this code, please ignore this email.",
                login_code
            ))?;

        self.transport.send(email).await?;
        Ok(())
    }
}
