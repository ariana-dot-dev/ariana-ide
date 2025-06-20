use crate::llm::{clients::*, providers::LLMProvider, types::*};
use actix_web::{
    web::{self, Bytes},
    HttpResponse, Result as ActixResult,
};
use futures::{stream::Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;

#[derive(Debug, Deserialize)]
pub struct InferenceRequest {
    pub provider: String,
    pub model: String,
    pub messages: Vec<ApiMessage>,
    pub api_key: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    pub max_tokens: Option<usize>,
    #[serde(default)]
    pub stream: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ApiMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct InferenceResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<UsageInfo>,
}

#[derive(Debug, Serialize)]
pub struct UsageInfo {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cached_input_tokens: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct StreamChunk {
    pub delta: String,
    pub model: String,
    pub done: bool,
}

#[derive(Debug, Serialize)]
pub struct ProvidersResponse {
    pub providers: Vec<ProviderInfo>,
}

#[derive(Debug, Serialize)]
pub struct ProviderInfo {
    pub name: String,
    pub display_name: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub error: String,
    pub code: String,
}

fn default_temperature() -> f32 {
    0.7
}

impl From<ApiMessage> for LLMClientMessage {
    fn from(msg: ApiMessage) -> Self {
        match msg.role.as_str() {
            "system" => LLMClientMessage::system(msg.content),
            "user" => LLMClientMessage::user(msg.content),
            "assistant" => LLMClientMessage::assistant(msg.content),
            _ => LLMClientMessage::user(msg.content), // fallback
        }
    }
}

fn parse_provider(provider: &str) -> Result<LLMProvider, ApiError> {
    LLMProvider::from_str(provider).ok_or_else(|| ApiError {
        error: "Invalid provider".to_string(),
        code: "INVALID_PROVIDER".to_string(),
    })
}

fn parse_model(model: &str) -> Result<LLMType, ApiError> {
    let llm_type = match model {
        // Anthropic models
        "claude-3-opus-20240229" => LLMType::ClaudeOpus,
        "claude-3-5-sonnet-20241022" => LLMType::ClaudeSonnet,
        "claude-3-haiku-20240307" => LLMType::ClaudeHaiku,
        
        // OpenAI models
        "gpt-4o" => LLMType::Gpt4O,
        "gpt-4o-mini" => LLMType::Gpt4OMini,
        "gpt-4-turbo" => LLMType::Gpt4Turbo,
        "o1" => LLMType::O1,
        "o1-mini" => LLMType::O1Mini,
        
        // Google models
        "gemini-1.5-pro" => LLMType::GeminiPro,
        "gemini-1.5-flash" => LLMType::GeminiProFlash,
        "gemini-2.0-flash" => LLMType::Gemini2_0Flash,
        
        // Groq models
        "llama-3.1-8b-instant" => LLMType::Llama3_1_8bInstruct,
        "llama-3.1-70b-versatile" => LLMType::Llama3_1_70bInstruct,
        
        // OpenRouter models (custom)
        model if model.starts_with("anthropic/") || model.starts_with("openai/") => {
            LLMType::Custom(model.to_string())
        },
        
        _ => {
            return Err(ApiError {
                error: "Invalid model".to_string(),
                code: "INVALID_MODEL".to_string(),
            })
        }
    };
    
    Ok(llm_type)
}

fn get_client(provider: &LLMProvider) -> Box<dyn LLMClient> {
    match provider {
        LLMProvider::Anthropic => Box::new(AnthropicClient::new()),
        LLMProvider::OpenAI => Box::new(OpenAIClient::new()),
        LLMProvider::Google => Box::new(GoogleClient::new()),
        LLMProvider::Groq => Box::new(GroqClient::new()),
        LLMProvider::OpenRouter => Box::new(OpenRouterClient::new()),
    }
}

pub async fn inference(
    body: web::Json<InferenceRequest>,
) -> ActixResult<HttpResponse> {
    let request = body.into_inner();
    
    // Validate provider
    let provider = match parse_provider(&request.provider) {
        Ok(p) => p,
        Err(e) => return Ok(HttpResponse::BadRequest().json(e)),
    };
    
    // Validate and parse model
    let model = match parse_model(&request.model) {
        Ok(m) => m,
        Err(e) => return Ok(HttpResponse::BadRequest().json(e)),
    };
    
    // Convert messages
    let messages: Vec<_> = request.messages.into_iter().map(|m| m.into()).collect();
    
    // Create completion request
    let mut completion_request = LLMClientCompletionRequest::new(
        model,
        messages,
        request.temperature,
    );
    
    if let Some(max_tokens) = request.max_tokens {
        completion_request = completion_request.set_max_tokens(max_tokens);
    }

    // Get the appropriate client and make the request
    let client = get_client(&provider);

    match client.completion(request.api_key, completion_request).await {
        Ok(content) => Ok(HttpResponse::Ok().json(InferenceResponse {
            content,
            model: request.model,
            usage: None, // Could be enhanced to return actual usage
        })),
        Err(e) => {
            match e {
                LLMClientError::UnauthorizedAccess => {
                    Ok(HttpResponse::Unauthorized().json(ApiError {
                        error: "Invalid API key".to_string(),
                        code: "UNAUTHORIZED".to_string(),
                    }))
                },
                LLMClientError::RateLimitExceeded => {
                    Ok(HttpResponse::TooManyRequests().json(ApiError {
                        error: "Rate limit exceeded".to_string(),
                        code: "RATE_LIMITED".to_string(),
                    }))
                },
                LLMClientError::UnSupportedModel => {
                    Ok(HttpResponse::BadRequest().json(ApiError {
                        error: "Model not supported".to_string(),
                        code: "UNSUPPORTED_MODEL".to_string(),
                    }))
                },
                _ => {
                    Ok(HttpResponse::InternalServerError().json(ApiError {
                        error: "Internal server error".to_string(),
                        code: "INTERNAL_ERROR".to_string(),
                    }))
                },
            }
        }
    }
}

// Custom stream wrapper for SSE
struct SseStream {
    receiver: UnboundedReceiverStream<LLMClientCompletionResponse>,
    model: String,
    done: bool,
}

impl SseStream {
    fn new(receiver: mpsc::UnboundedReceiver<LLMClientCompletionResponse>, model: String) -> Self {
        Self {
            receiver: UnboundedReceiverStream::new(receiver),
            model,
            done: false,
        }
    }
}

impl Stream for SseStream {
    type Item = Result<Bytes, actix_web::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.done {
            return Poll::Ready(None);
        }

        match self.receiver.poll_next_unpin(cx) {
            Poll::Ready(Some(response)) => {
                let chunk = StreamChunk {
                    delta: response.delta().unwrap_or("").to_string(),
                    model: self.model.clone(),
                    done: false,
                };
                
                let json = match serde_json::to_string(&chunk) {
                    Ok(j) => j,
                    Err(_) => return Poll::Ready(Some(Ok(Bytes::from("data: {\"error\": \"serialization_error\"}\n\n")))),
                };
                
                let sse_data = format!("data: {}\n\n", json);
                Poll::Ready(Some(Ok(Bytes::from(sse_data))))
            }
            Poll::Ready(None) => {
                self.done = true;
                let final_chunk = StreamChunk {
                    delta: String::new(),
                    model: self.model.clone(),
                    done: true,
                };
                
                let json = serde_json::to_string(&final_chunk).unwrap_or_default();
                let sse_data = format!("data: {}\n\n", json);
                Poll::Ready(Some(Ok(Bytes::from(sse_data))))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

pub async fn inference_stream(
    body: web::Json<InferenceRequest>,
) -> ActixResult<HttpResponse> {
    let request = body.into_inner();
    
    // Validate provider
    let provider = match parse_provider(&request.provider) {
        Ok(p) => p,
        Err(e) => return Ok(HttpResponse::BadRequest().json(e)),
    };
    
    // Validate and parse model
    let model = match parse_model(&request.model) {
        Ok(m) => m,
        Err(e) => return Ok(HttpResponse::BadRequest().json(e)),
    };
    
    // Convert messages
    let messages: Vec<_> = request.messages.into_iter().map(|m| m.into()).collect();
    
    // Create completion request
    let mut completion_request = LLMClientCompletionRequest::new(
        model,
        messages,
        request.temperature,
    );
    
    if let Some(max_tokens) = request.max_tokens {
        completion_request = completion_request.set_max_tokens(max_tokens);
    }

    // Create channel for streaming
    let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
    
    // Get the appropriate client
    let client = get_client(&provider);
    let api_key = request.api_key.clone();
    let model_name = request.model.clone();

    // Start streaming in the background
    tokio::spawn(async move {
        let _ = client.stream_completion(api_key, completion_request, sender).await;
    });

    // Create SSE stream
    let stream = SseStream::new(receiver, model_name);

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .insert_header(("Cache-Control", "no-cache"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .streaming(stream))
}

pub async fn list_providers() -> ActixResult<HttpResponse> {
    let providers = vec![
        ProviderInfo {
            name: "anthropic".to_string(),
            display_name: "Anthropic".to_string(),
            models: vec![
                ModelInfo {
                    id: "claude-3-opus-20240229".to_string(),
                    name: "Claude 3 Opus".to_string(),
                    context_length: Some(200_000),
                },
                ModelInfo {
                    id: "claude-3-5-sonnet-20241022".to_string(),
                    name: "Claude 3.5 Sonnet".to_string(),
                    context_length: Some(200_000),
                },
                ModelInfo {
                    id: "claude-3-haiku-20240307".to_string(),
                    name: "Claude 3 Haiku".to_string(),
                    context_length: Some(200_000),
                },
            ],
        },
        ProviderInfo {
            name: "openai".to_string(),
            display_name: "OpenAI".to_string(),
            models: vec![
                ModelInfo {
                    id: "gpt-4o".to_string(),
                    name: "GPT-4o".to_string(),
                    context_length: Some(128_000),
                },
                ModelInfo {
                    id: "gpt-4o-mini".to_string(),
                    name: "GPT-4o Mini".to_string(),
                    context_length: Some(128_000),
                },
                ModelInfo {
                    id: "gpt-4-turbo".to_string(),
                    name: "GPT-4 Turbo".to_string(),
                    context_length: Some(128_000),
                },
                ModelInfo {
                    id: "o1".to_string(),
                    name: "o1".to_string(),
                    context_length: Some(200_000),
                },
                ModelInfo {
                    id: "o1-mini".to_string(),
                    name: "o1 Mini".to_string(),
                    context_length: Some(128_000),
                },
            ],
        },
        ProviderInfo {
            name: "google".to_string(),
            display_name: "Google".to_string(),
            models: vec![
                ModelInfo {
                    id: "gemini-1.5-pro".to_string(),
                    name: "Gemini 1.5 Pro".to_string(),
                    context_length: Some(2_000_000),
                },
                ModelInfo {
                    id: "gemini-1.5-flash".to_string(),
                    name: "Gemini 1.5 Flash".to_string(),
                    context_length: Some(1_000_000),
                },
                ModelInfo {
                    id: "gemini-2.0-flash".to_string(),
                    name: "Gemini 2.0 Flash".to_string(),
                    context_length: Some(1_000_000),
                },
            ],
        },
        ProviderInfo {
            name: "groq".to_string(),
            display_name: "Groq".to_string(),
            models: vec![
                ModelInfo {
                    id: "llama-3.1-8b-instant".to_string(),
                    name: "Llama 3.1 8B".to_string(),
                    context_length: Some(131_072),
                },
                ModelInfo {
                    id: "llama-3.1-70b-versatile".to_string(),
                    name: "Llama 3.1 70B".to_string(),
                    context_length: Some(131_072),
                },
            ],
        },
        ProviderInfo {
            name: "openrouter".to_string(),
            display_name: "OpenRouter".to_string(),
            models: vec![
                ModelInfo {
                    id: "anthropic/claude-3.5-sonnet:beta".to_string(),
                    name: "Claude 3.5 Sonnet".to_string(),
                    context_length: Some(200_000),
                },
                ModelInfo {
                    id: "openai/gpt-4o".to_string(),
                    name: "GPT-4o".to_string(),
                    context_length: Some(128_000),
                },
            ],
        },
    ];

    Ok(HttpResponse::Ok().json(ProvidersResponse { providers }))
}
