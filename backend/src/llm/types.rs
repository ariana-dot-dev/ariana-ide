use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;
use tokio::sync::mpsc::UnboundedSender;

/// Represents different types of Language Learning Models (LLMs)
#[derive(Debug, Clone, PartialEq, Hash, Eq, Serialize, Deserialize)]
pub enum LLMType {
    // Anthropic models
    ClaudeOpus,
    ClaudeSonnet,
    ClaudeHaiku,
    
    // OpenAI models
    Gpt4O,
    Gpt4OMini,
    Gpt4Turbo,
    O1,
    O1Mini,
    
    // Google models
    GeminiPro,
    GeminiProFlash,
    Gemini2_0Flash,
    
    // Groq models
    Llama3_1_8bInstruct,
    Llama3_1_70bInstruct,
    
    // Custom model type with a specified name
    Custom(String),
}

impl fmt::Display for LLMType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LLMType::ClaudeOpus => write!(f, "claude-3-opus-20240229"),
            LLMType::ClaudeSonnet => write!(f, "claude-3-5-sonnet-20241022"),
            LLMType::ClaudeHaiku => write!(f, "claude-3-haiku-20240307"),
            LLMType::Gpt4O => write!(f, "gpt-4o"),
            LLMType::Gpt4OMini => write!(f, "gpt-4o-mini"),
            LLMType::Gpt4Turbo => write!(f, "gpt-4-turbo"),
            LLMType::O1 => write!(f, "o1"),
            LLMType::O1Mini => write!(f, "o1-mini"),
            LLMType::GeminiPro => write!(f, "gemini-1.5-pro"),
            LLMType::GeminiProFlash => write!(f, "gemini-1.5-flash"),
            LLMType::Gemini2_0Flash => write!(f, "gemini-2.0-flash"),
            LLMType::Llama3_1_8bInstruct => write!(f, "llama-3.1-8b-instant"),
            LLMType::Llama3_1_70bInstruct => write!(f, "llama-3.1-70b-versatile"),
            LLMType::Custom(s) => write!(f, "{}", s),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq)]
pub enum LLMClientRole {
    System,
    User,
    Assistant,
}

impl LLMClientRole {
    pub fn is_system(&self) -> bool {
        matches!(self, LLMClientRole::System)
    }

    pub fn is_user(&self) -> bool {
        matches!(self, LLMClientRole::User)
    }

    pub fn is_assistant(&self) -> bool {
        matches!(self, LLMClientRole::Assistant)
    }

    pub fn to_string(&self) -> String {
        match self {
            LLMClientRole::System => "system".to_owned(),
            LLMClientRole::User => "user".to_owned(),
            LLMClientRole::Assistant => "assistant".to_owned(),
        }
    }
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct LLMClientMessage {
    role: LLMClientRole,
    content: String,
}

impl LLMClientMessage {
    pub fn new(role: LLMClientRole, content: String) -> Self {
        Self { role, content }
    }

    pub fn user(content: String) -> Self {
        Self::new(LLMClientRole::User, content)
    }

    pub fn assistant(content: String) -> Self {
        Self::new(LLMClientRole::Assistant, content)
    }

    pub fn system(content: String) -> Self {
        Self::new(LLMClientRole::System, content)
    }

    pub fn role(&self) -> &LLMClientRole {
        &self.role
    }

    pub fn content(&self) -> &str {
        &self.content
    }
}

#[derive(Clone, Debug)]
pub struct LLMClientCompletionRequest {
    model: LLMType,
    messages: Vec<LLMClientMessage>,
    temperature: f32,
    max_tokens: Option<usize>,
}

impl LLMClientCompletionRequest {
    pub fn new(
        model: LLMType,
        messages: Vec<LLMClientMessage>,
        temperature: f32,
    ) -> Self {
        Self {
            model,
            messages,
            temperature,
            max_tokens: None,
        }
    }

    pub fn set_max_tokens(mut self, max_tokens: usize) -> Self {
        self.max_tokens = Some(max_tokens);
        self
    }

    pub fn model(&self) -> &LLMType {
        &self.model
    }

    pub fn messages(&self) -> &[LLMClientMessage] {
        &self.messages
    }

    pub fn temperature(&self) -> f32 {
        self.temperature
    }

    pub fn max_tokens(&self) -> Option<usize> {
        self.max_tokens
    }
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct LLMClientUsageStatistics {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    cached_input_tokens: Option<u32>,
}

impl LLMClientUsageStatistics {
    pub fn new() -> Self {
        Self {
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
        }
    }

    pub fn input_tokens(&self) -> Option<u32> {
        self.input_tokens
    }

    pub fn output_tokens(&self) -> Option<u32> {
        self.output_tokens
    }

    pub fn cached_input_tokens(&self) -> Option<u32> {
        self.cached_input_tokens
    }
}

#[derive(Debug)]
pub struct LLMClientCompletionResponse {
    answer_up_until_now: String,
    delta: Option<String>,
    model: String,
    usage_statistics: LLMClientUsageStatistics,
}

impl LLMClientCompletionResponse {
    pub fn new(answer_up_until_now: String, delta: Option<String>, model: String) -> Self {
        Self {
            answer_up_until_now,
            delta,
            model,
            usage_statistics: LLMClientUsageStatistics::new(),
        }
    }

    pub fn answer_up_until_now(&self) -> &str {
        &self.answer_up_until_now
    }

    pub fn delta(&self) -> Option<&str> {
        self.delta.as_deref()
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub fn usage_statistics(&self) -> &LLMClientUsageStatistics {
        &self.usage_statistics
    }
}

#[derive(Error, Debug)]
pub enum LLMClientError {
    #[error("Failed to get response from LLM")]
    FailedToGetResponse,

    #[error("Reqwest error: {0}")]
    ReqwestError(#[from] reqwest::Error),

    #[error("Reqwest middleware error: {0}")]
    ReqwestMiddlewareError(#[from] reqwest_middleware::Error),

    #[error("Serde error: {0}")]
    SerdeError(#[from] serde_json::Error),

    #[error("Send error over channel: {0}")]
    SendError(#[from] tokio::sync::mpsc::error::SendError<LLMClientCompletionResponse>),

    #[error("Unsupported model")]
    UnSupportedModel,

    #[error("OpenAI API error: {0}")]
    OpenAPIError(#[from] async_openai::error::OpenAIError),

    #[error("Wrong API key type")]
    WrongAPIKeyType,

    #[error("Unauthorized access to API")]
    UnauthorizedAccess,

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Event stream error: {0}")]
    EventStreamError(String),
}

#[async_trait]
pub trait LLMClient: Send + Sync {
    async fn stream_completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
        sender: UnboundedSender<LLMClientCompletionResponse>,
    ) -> Result<LLMClientCompletionResponse, LLMClientError>;

    async fn completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
    ) -> Result<String, LLMClientError>;
}
