# LLM API Documentation

This document describes the LLM API endpoints available in the Ariana IDE backend.

## Base URL

All API endpoints are available under `/api` path:
- Base URL: `http://localhost:8080/api`

## Authentication

All LLM API calls require you to provide your own API key for the respective provider.

## Endpoints

### 1. List Providers and Models

**GET** `/api/providers`

Returns a list of all supported LLM providers and their available models.

**Response:**
```json
{
  "providers": [
    {
      "name": "anthropic",
      "display_name": "Anthropic",
      "models": [
        {
          "id": "claude-3-opus-20240229",
          "name": "Claude 3 Opus",
          "context_length": 200000
        },
        {
          "id": "claude-3-5-sonnet-20241022",
          "name": "Claude 3.5 Sonnet",
          "context_length": 200000
        },
        {
          "id": "claude-3-haiku-20240307",
          "name": "Claude 3 Haiku",
          "context_length": 200000
        }
      ]
    },
    {
      "name": "openai",
      "display_name": "OpenAI",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "context_length": 128000
        },
        {
          "id": "gpt-4o-mini",
          "name": "GPT-4o Mini",
          "context_length": 128000
        },
        {
          "id": "gpt-4-turbo",
          "name": "GPT-4 Turbo",
          "context_length": 128000
        },
        {
          "id": "o1",
          "name": "o1",
          "context_length": 200000
        },
        {
          "id": "o1-mini",
          "name": "o1 Mini",
          "context_length": 128000
        }
      ]
    }
  ]
}
```

### 2. Non-Streaming Inference

**POST** `/api/inference`

Sends a completion request to an LLM and returns the complete response.

**Request Body:**
```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "api_key": "sk-ant-...",
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**
```json
{
  "content": "Hello! I'm doing well, thank you for asking. I'm here and ready to help you with any questions or tasks you might have. How are you doing today?",
  "model": "claude-3-5-sonnet-20241022",
  "usage": null
}
```

### 3. Streaming Inference

**POST** `/api/inference/stream`

Sends a completion request to an LLM and returns a streaming response using Server-Sent Events (SSE).

**Request Body:**
Same as non-streaming inference.

**Response:**
Server-Sent Events stream with `Content-Type: text/event-stream`

Each event contains:
```json
{
  "delta": "Hello",
  "model": "claude-3-5-sonnet-20241022",
  "done": false
}
```

The final event will have `"done": true` and an empty `delta`.

## Supported Providers

### Anthropic
- **Provider ID:** `anthropic`
- **Models:**
  - `claude-3-opus-20240229` - Claude 3 Opus
  - `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet
  - `claude-3-haiku-20240307` - Claude 3 Haiku
- **API Key Format:** `sk-ant-...`

### OpenAI
- **Provider ID:** `openai`
- **Models:**
  - `gpt-4o` - GPT-4o
  - `gpt-4o-mini` - GPT-4o Mini
  - `gpt-4-turbo` - GPT-4 Turbo
  - `o1` - o1
  - `o1-mini` - o1 Mini
- **API Key Format:** `sk-...`

### Google
- **Provider ID:** `google`
- **Models:**
  - `gemini-1.5-pro` - Gemini 1.5 Pro
  - `gemini-1.5-flash` - Gemini 1.5 Flash
  - `gemini-2.0-flash` - Gemini 2.0 Flash
- **API Key Format:** Google AI Studio API key

### Groq
- **Provider ID:** `groq`
- **Models:**
  - `llama-3.1-8b-instant` - Llama 3.1 8B
  - `llama-3.1-70b-versatile` - Llama 3.1 70B
- **API Key Format:** `gsk_...`

### OpenRouter
- **Provider ID:** `openrouter`
- **Models:**
  - `anthropic/claude-3.5-sonnet:beta` - Claude 3.5 Sonnet
  - `openai/gpt-4o` - GPT-4o
- **API Key Format:** `sk-or-...`

## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `provider` | string | Yes | Provider identifier (anthropic, openai, google, groq, openrouter) |
| `model` | string | Yes | Model identifier from the provider |
| `messages` | array | Yes | Array of message objects |
| `api_key` | string | Yes | Your API key for the provider |
| `temperature` | number | No | Sampling temperature (0.0-2.0), default: 0.7 |
| `max_tokens` | number | No | Maximum tokens to generate |
| `stream` | boolean | No | Enable streaming (only for `/inference/stream`) |

## Message Format

Each message in the `messages` array should have:
- `role`: Either "system", "user", or "assistant"
- `content`: The message content as a string

## Error Responses

All error responses follow this format:
```json
{
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `INVALID_PROVIDER` - Unsupported provider
- `INVALID_MODEL` - Unsupported model for the provider
- `UNAUTHORIZED` - Invalid API key
- `RATE_LIMITED` - Rate limit exceeded
- `UNSUPPORTED_MODEL` - Model not supported by the provider
- `INTERNAL_ERROR` - Server error

## Examples

### cURL Examples

**List providers:**
```bash
curl http://localhost:8080/api/providers
```

**Non-streaming inference:**
```bash
curl -X POST http://localhost:8080/api/inference \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "api_key": "sk-ant-your-key-here",
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

**Streaming inference:**
```bash
curl -X POST http://localhost:8080/api/inference/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Write a short story"}
    ],
    "api_key": "sk-your-openai-key-here",
    "stream": true
  }'
```

### JavaScript Fetch Examples

**Non-streaming:**
```javascript
const response = await fetch('http://localhost:8080/api/inference', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
    api_key: 'sk-ant-your-key-here',
    temperature: 0.7
  })
});

const data = await response.json();
console.log(data.content);
```

**Streaming:**
```javascript
const response = await fetch('http://localhost:8080/api/inference/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    provider: 'openai',
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: 'Tell me a joke' }
    ],
    api_key: 'sk-your-openai-key-here'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      console.log(data.delta);
      if (data.done) break;
    }
  }
}
```
