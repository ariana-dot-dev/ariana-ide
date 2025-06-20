use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Hash, Eq, Serialize, Deserialize)]
pub enum LLMProvider {
    Anthropic,
    OpenAI,
    Google,
    Groq,
    OpenRouter,
}

impl std::fmt::Display for LLMProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LLMProvider::Anthropic => write!(f, "anthropic"),
            LLMProvider::OpenAI => write!(f, "openai"),
            LLMProvider::Google => write!(f, "google"),
            LLMProvider::Groq => write!(f, "groq"),
            LLMProvider::OpenRouter => write!(f, "openrouter"),
        }
    }
}

impl LLMProvider {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "anthropic" => Some(LLMProvider::Anthropic),
            "openai" => Some(LLMProvider::OpenAI),
            "google" => Some(LLMProvider::Google),
            "groq" => Some(LLMProvider::Groq),
            "openrouter" => Some(LLMProvider::OpenRouter),
            _ => None,
        }
    }
}
