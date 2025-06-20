#!/bin/bash

# Test script for Ariana IDE LLM API
# Make sure the backend server is running on localhost:8080

BASE_URL="http://localhost:8080/api"

echo "Testing Ariana IDE LLM API..."
echo "================================"

# Test 1: List providers
echo "Test 1: Fetching providers..."
curl -s "$BASE_URL/providers" | jq .
echo ""

# Test 2: Non-streaming inference (requires valid API key)
echo "Test 2: Non-streaming inference (you need to provide a valid API key)..."
echo "Example command:"
echo 'curl -X POST '"$BASE_URL"'/inference \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{'
echo '    "provider": "anthropic",'
echo '    "model": "claude-3-haiku-20240307",'
echo '    "messages": ['
echo '      {"role": "user", "content": "Hello, how are you?"}'
echo '    ],'
echo '    "api_key": "sk-ant-your-key-here",'
echo '    "temperature": 0.7,'
echo '    "max_tokens": 100'
echo '  }'"'"
echo ""

# Test 3: Streaming inference (requires valid API key)
echo "Test 3: Streaming inference (you need to provide a valid API key)..."
echo "Example command:"
echo 'curl -X POST '"$BASE_URL"'/inference/stream \'
echo '  -H "Content-Type: application/json" \'
echo '  -H "Accept: text/event-stream" \'
echo '  -d '"'"'{'
echo '    "provider": "openai",'
echo '    "model": "gpt-4o-mini",'
echo '    "messages": ['
echo '      {"role": "user", "content": "Count to 5"}'
echo '    ],'
echo '    "api_key": "sk-your-openai-key-here"'
echo '  }'"'"
echo ""

# Test 4: Error handling - Invalid provider
echo "Test 4: Error handling - Invalid provider..."
curl -s -X POST "$BASE_URL/inference" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "invalid",
    "model": "test",
    "messages": [{"role": "user", "content": "test"}],
    "api_key": "test"
  }' | jq .
echo ""

# Test 5: Error handling - Invalid model
echo "Test 5: Error handling - Invalid model..."
curl -s -X POST "$BASE_URL/inference" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "model": "invalid-model",
    "messages": [{"role": "user", "content": "test"}],
    "api_key": "test"
  }' | jq .
echo ""

echo "API tests completed!"
echo ""
echo "To test with real API keys, replace the placeholder keys in the examples above."
echo "Available providers: anthropic, openai, google, groq, openrouter"
