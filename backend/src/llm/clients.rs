use crate::llm::types::*;
use async_trait::async_trait;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;
use tracing::error;

pub struct AnthropicClient {
    client: Client,
    base_url: String,
}

impl AnthropicClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://api.anthropic.com".to_string(),
        }
    }

    fn get_model_string(&self, llm_type: &LLMType) -> Result<String, LLMClientError> {
        match llm_type {
            LLMType::ClaudeOpus => Ok("claude-3-opus-20240229".to_owned()),
            LLMType::ClaudeSonnet => Ok("claude-3-5-sonnet-20241022".to_owned()),
            LLMType::ClaudeHaiku => Ok("claude-3-haiku-20240307".to_owned()),
            LLMType::Custom(model) => Ok(model.to_owned()),
            _ => Err(LLMClientError::UnSupportedModel),
        }
    }

    fn create_request_body(&self, request: &LLMClientCompletionRequest, model_str: String) -> Value {
        let messages: Vec<Value> = request.messages()
            .iter()
            .filter(|msg| !msg.role().is_system())
            .map(|msg| {
                json!({
                    "role": msg.role().to_string(),
                    "content": msg.content()
                })
            })
            .collect();

        let system_message = request.messages()
            .iter()
            .find(|msg| msg.role().is_system())
            .map(|msg| msg.content());

        let mut body = json!({
            "model": model_str,
            "messages": messages,
            "temperature": request.temperature(),
            "stream": true,
            "max_tokens": request.max_tokens().unwrap_or(4096)
        });

        if let Some(system) = system_message {
            body["system"] = json!(system);
        }

        body
    }
}

#[async_trait]
impl LLMClient for AnthropicClient {
    async fn stream_completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
        sender: UnboundedSender<LLMClientCompletionResponse>,
    ) -> Result<LLMClientCompletionResponse, LLMClientError> {
        let model_str = self.get_model_string(request.model())?;
        let body = self.create_request_body(&request, model_str.clone());

        let response = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(LLMClientError::UnauthorizedAccess);
        }

        let mut event_source = response.bytes_stream().eventsource();
        let mut buffered_string = String::new();

        while let Some(event) = event_source.next().await {
            match event {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        break;
                    }

                    if let Ok(parsed) = serde_json::from_str::<Value>(&event.data) {
                        if let Some(delta_obj) = parsed.get("delta") {
                            if let Some(text) = delta_obj.get("text").and_then(|t| t.as_str()) {
                                buffered_string.push_str(text);
                                let _ = sender.send(LLMClientCompletionResponse::new(
                                    buffered_string.clone(),
                                    Some(text.to_string()),
                                    model_str.clone(),
                                ));
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        Ok(LLMClientCompletionResponse::new(
            buffered_string,
            None,
            model_str,
        ))
    }

    async fn completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
    ) -> Result<String, LLMClientError> {
        let (sender, _) = tokio::sync::mpsc::unbounded_channel();
        let response = self.stream_completion(api_key, request, sender).await?;
        Ok(response.answer_up_until_now().to_string())
    }
}

pub struct OpenAIClient {
    client: Client,
    base_url: String,
}

impl OpenAIClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://api.openai.com".to_string(),
        }
    }

    fn get_model_string(&self, llm_type: &LLMType) -> Result<String, LLMClientError> {
        match llm_type {
            LLMType::Gpt4O => Ok("gpt-4o".to_owned()),
            LLMType::Gpt4OMini => Ok("gpt-4o-mini".to_owned()),
            LLMType::Gpt4Turbo => Ok("gpt-4-turbo".to_owned()),
            LLMType::O1 => Ok("o1".to_owned()),
            LLMType::O1Mini => Ok("o1-mini".to_owned()),
            LLMType::Custom(model) => Ok(model.to_owned()),
            _ => Err(LLMClientError::UnSupportedModel),
        }
    }

    fn create_request_body(&self, request: &LLMClientCompletionRequest, model_str: String) -> Value {
        let messages: Vec<Value> = request.messages()
            .iter()
            .map(|msg| {
                json!({
                    "role": msg.role().to_string(),
                    "content": msg.content()
                })
            })
            .collect();

        json!({
            "model": model_str,
            "messages": messages,
            "temperature": request.temperature(),
            "stream": true,
            "max_tokens": request.max_tokens().unwrap_or(4096)
        })
    }
}

#[async_trait]
impl LLMClient for OpenAIClient {
    async fn stream_completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
        sender: UnboundedSender<LLMClientCompletionResponse>,
    ) -> Result<LLMClientCompletionResponse, LLMClientError> {
        let model_str = self.get_model_string(request.model())?;
        let body = self.create_request_body(&request, model_str.clone());

        let response = self
            .client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(LLMClientError::UnauthorizedAccess);
        }

        let mut event_source = response.bytes_stream().eventsource();
        let mut buffered_string = String::new();

        while let Some(event) = event_source.next().await {
            match event {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        break;
                    }

                    if let Ok(parsed) = serde_json::from_str::<Value>(&event.data) {
                        if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                            if let Some(choice) = choices.first() {
                                if let Some(delta) = choice.get("delta") {
                                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                        buffered_string.push_str(content);
                                        let _ = sender.send(LLMClientCompletionResponse::new(
                                            buffered_string.clone(),
                                            Some(content.to_string()),
                                            model_str.clone(),
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        Ok(LLMClientCompletionResponse::new(
            buffered_string,
            None,
            model_str,
        ))
    }

    async fn completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
    ) -> Result<String, LLMClientError> {
        let (sender, _) = tokio::sync::mpsc::unbounded_channel();
        let response = self.stream_completion(api_key, request, sender).await?;
        Ok(response.answer_up_until_now().to_string())
    }
}

pub struct GoogleClient {
    client: Client,
    base_url: String,
}

impl GoogleClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://generativelanguage.googleapis.com".to_string(),
        }
    }

    fn get_model_string(&self, llm_type: &LLMType) -> Result<String, LLMClientError> {
        match llm_type {
            LLMType::GeminiPro => Ok("gemini-1.5-pro".to_owned()),
            LLMType::GeminiProFlash => Ok("gemini-1.5-flash".to_owned()),
            LLMType::Gemini2_0Flash => Ok("gemini-2.0-flash".to_owned()),
            LLMType::Custom(model) => Ok(model.to_owned()),
            _ => Err(LLMClientError::UnSupportedModel),
        }
    }

    fn create_request_body(&self, request: &LLMClientCompletionRequest) -> Value {
        let contents: Vec<Value> = request.messages()
            .iter()
            .filter(|msg| !msg.role().is_system())
            .map(|msg| {
                json!({
                    "role": if msg.role().is_user() { "user" } else { "model" },
                    "parts": [{"text": msg.content()}]
                })
            })
            .collect();

        let system_instruction = request.messages()
            .iter()
            .find(|msg| msg.role().is_system())
            .map(|msg| {
                json!({
                    "parts": [{"text": msg.content()}]
                })
            });

        let mut body = json!({
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature(),
                "maxOutputTokens": request.max_tokens().unwrap_or(8192)
            }
        });

        if let Some(system) = system_instruction {
            body["systemInstruction"] = system;
        }

        body
    }
}

#[async_trait]
impl LLMClient for GoogleClient {
    async fn stream_completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
        sender: UnboundedSender<LLMClientCompletionResponse>,
    ) -> Result<LLMClientCompletionResponse, LLMClientError> {
        let model_str = self.get_model_string(request.model())?;
        let body = self.create_request_body(&request);

        let url = format!(
            "{}/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            self.base_url, model_str, api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(LLMClientError::UnauthorizedAccess);
        }

        let mut event_source = response.bytes_stream().eventsource();
        let mut buffered_string = String::new();

        while let Some(event) = event_source.next().await {
            match event {
                Ok(event) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&event.data) {
                        if let Some(candidates) = parsed.get("candidates").and_then(|c| c.as_array()) {
                            if let Some(candidate) = candidates.first() {
                                if let Some(content) = candidate.get("content") {
                                    if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                                        if let Some(part) = parts.first() {
                                            if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                                buffered_string.push_str(text);
                                                let _ = sender.send(LLMClientCompletionResponse::new(
                                                    buffered_string.clone(),
                                                    Some(text.to_string()),
                                                    model_str.clone(),
                                                ));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        Ok(LLMClientCompletionResponse::new(
            buffered_string,
            None,
            model_str,
        ))
    }

    async fn completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
    ) -> Result<String, LLMClientError> {
        let (sender, _) = tokio::sync::mpsc::unbounded_channel();
        let response = self.stream_completion(api_key, request, sender).await?;
        Ok(response.answer_up_until_now().to_string())
    }
}

pub struct GroqClient {
    client: Client,
    base_url: String,
}

impl GroqClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://api.groq.com".to_string(),
        }
    }

    fn get_model_string(&self, llm_type: &LLMType) -> Result<String, LLMClientError> {
        match llm_type {
            LLMType::Llama3_1_8bInstruct => Ok("llama-3.1-8b-instant".to_owned()),
            LLMType::Llama3_1_70bInstruct => Ok("llama-3.1-70b-versatile".to_owned()),
            LLMType::Custom(model) => Ok(model.to_owned()),
            _ => Err(LLMClientError::UnSupportedModel),
        }
    }

    fn create_request_body(&self, request: &LLMClientCompletionRequest, model_str: String) -> Value {
        let messages: Vec<Value> = request.messages()
            .iter()
            .map(|msg| {
                json!({
                    "role": msg.role().to_string(),
                    "content": msg.content()
                })
            })
            .collect();

        json!({
            "model": model_str,
            "messages": messages,
            "temperature": request.temperature(),
            "stream": true,
            "max_tokens": request.max_tokens().unwrap_or(4096)
        })
    }
}

#[async_trait]
impl LLMClient for GroqClient {
    async fn stream_completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
        sender: UnboundedSender<LLMClientCompletionResponse>,
    ) -> Result<LLMClientCompletionResponse, LLMClientError> {
        let model_str = self.get_model_string(request.model())?;
        let body = self.create_request_body(&request, model_str.clone());

        let response = self
            .client
            .post(format!("{}/openai/v1/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(LLMClientError::UnauthorizedAccess);
        }

        let mut event_source = response.bytes_stream().eventsource();
        let mut buffered_string = String::new();

        while let Some(event) = event_source.next().await {
            match event {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        break;
                    }

                    if let Ok(parsed) = serde_json::from_str::<Value>(&event.data) {
                        if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                            if let Some(choice) = choices.first() {
                                if let Some(delta) = choice.get("delta") {
                                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                        buffered_string.push_str(content);
                                        let _ = sender.send(LLMClientCompletionResponse::new(
                                            buffered_string.clone(),
                                            Some(content.to_string()),
                                            model_str.clone(),
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        Ok(LLMClientCompletionResponse::new(
            buffered_string,
            None,
            model_str,
        ))
    }

    async fn completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
    ) -> Result<String, LLMClientError> {
        let (sender, _) = tokio::sync::mpsc::unbounded_channel();
        let response = self.stream_completion(api_key, request, sender).await?;
        Ok(response.answer_up_until_now().to_string())
    }
}

pub struct OpenRouterClient {
    client: Client,
    base_url: String,
}

impl OpenRouterClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            base_url: "https://openrouter.ai".to_string(),
        }
    }

    fn create_request_body(&self, request: &LLMClientCompletionRequest, model: String) -> Value {
        let messages: Vec<Value> = request.messages()
            .iter()
            .map(|msg| {
                json!({
                    "role": msg.role().to_string(),
                    "content": msg.content()
                })
            })
            .collect();

        json!({
            "model": model,
            "messages": messages,
            "temperature": request.temperature(),
            "stream": true,
            "max_tokens": request.max_tokens().unwrap_or(4096)
        })
    }
}

#[async_trait]
impl LLMClient for OpenRouterClient {
    async fn stream_completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
        sender: UnboundedSender<LLMClientCompletionResponse>,
    ) -> Result<LLMClientCompletionResponse, LLMClientError> {
        let model_str = match request.model() {
            LLMType::Custom(model) => model.clone(),
            _ => request.model().to_string(),
        };

        let body = self.create_request_body(&request, model_str.clone());

        let response = self
            .client
            .post(format!("{}/api/v1/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .header("HTTP-Referer", "https://ariana.dev")
            .header("X-Title", "Ariana IDE")
            .json(&body)
            .send()
            .await?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(LLMClientError::UnauthorizedAccess);
        }

        let mut event_source = response.bytes_stream().eventsource();
        let mut buffered_string = String::new();

        while let Some(event) = event_source.next().await {
            match event {
                Ok(event) => {
                    if event.data == "[DONE]" {
                        break;
                    }

                    if let Ok(parsed) = serde_json::from_str::<Value>(&event.data) {
                        if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                            if let Some(choice) = choices.first() {
                                if let Some(delta) = choice.get("delta") {
                                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                        buffered_string.push_str(content);
                                        let _ = sender.send(LLMClientCompletionResponse::new(
                                            buffered_string.clone(),
                                            Some(content.to_string()),
                                            model_str.clone(),
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Stream error: {:?}", e);
                    break;
                }
            }
        }

        Ok(LLMClientCompletionResponse::new(
            buffered_string,
            None,
            model_str,
        ))
    }

    async fn completion(
        &self,
        api_key: String,
        request: LLMClientCompletionRequest,
    ) -> Result<String, LLMClientError> {
        let (sender, _) = tokio::sync::mpsc::unbounded_channel();
        let response = self.stream_completion(api_key, request, sender).await?;
        Ok(response.answer_up_until_now().to_string())
    }
}
