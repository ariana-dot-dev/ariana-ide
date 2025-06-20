/**
 * Frontend Integration Examples for Ariana IDE LLM API
 * 
 * This file contains example implementations for integrating with the LLM API
 * from a frontend application.
 */

// Base configuration
const API_BASE_URL = 'http://localhost:8080/api';

/**
 * LLM API Client Class
 */
class LLMClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get list of available providers and models
   */
  async getProviders() {
    try {
      const response = await fetch(`${this.baseUrl}/providers`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch providers:', error);
      throw error;
    }
  }

  /**
   * Send a non-streaming completion request
   */
  async completion(request) {
    try {
      const response = await fetch(`${this.baseUrl}/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`API Error: ${error.error} (${error.code})`);
      }

      return await response.json();
    } catch (error) {
      console.error('Completion request failed:', error);
      throw error;
    }
  }

  /**
   * Send a streaming completion request
   */
  async streamCompletion(request, onChunk, onComplete, onError) {
    try {
      const response = await fetch(`${this.baseUrl}/inference/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`API Error: ${error.error} (${error.code})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) {
                onComplete && onComplete();
                return;
              } else {
                onChunk && onChunk(data.delta, data);
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming request failed:', error);
      onError && onError(error);
    }
  }
}

/**
 * React Hook for LLM API
 */
function useLLMAPI() {
  const [client] = useState(() => new LLMClient());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (provider, model, messages, apiKey, options = {}) => {
    setLoading(true);
    setError(null);

    const request = {
      provider,
      model,
      messages,
      api_key: apiKey,
      temperature: options.temperature || 0.7,
      ...(options.maxTokens && { max_tokens: options.maxTokens })
    };

    try {
      if (options.stream) {
        return new Promise((resolve, reject) => {
          let fullResponse = '';
          
          client.streamCompletion(
            request,
            (delta) => {
              fullResponse += delta;
              options.onChunk && options.onChunk(delta, fullResponse);
            },
            () => {
              setLoading(false);
              resolve(fullResponse);
            },
            (error) => {
              setLoading(false);
              setError(error);
              reject(error);
            }
          );
        });
      } else {
        const response = await client.completion(request);
        setLoading(false);
        return response.content;
      }
    } catch (error) {
      setLoading(false);
      setError(error);
      throw error;
    }
  }, [client]);

  const getProviders = useCallback(async () => {
    try {
      return await client.getProviders();
    } catch (error) {
      setError(error);
      throw error;
    }
  }, [client]);

  return {
    sendMessage,
    getProviders,
    loading,
    error,
    client
  };
}

/**
 * Example React Component
 */
function ChatInterface() {
  const { sendMessage, getProviders, loading, error } = useLLMAPI();
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');

  // Load providers on component mount
  useEffect(() => {
    getProviders().then(setProviders).catch(console.error);
  }, [getProviders]);

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedProvider || !selectedModel || !apiKey) {
      alert('Please fill in all fields');
      return;
    }

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setResponse('');

    try {
      await sendMessage(
        selectedProvider,
        selectedModel,
        newMessages,
        apiKey,
        {
          stream: true,
          onChunk: (delta, fullResponse) => {
            setResponse(fullResponse);
          }
        }
      );

      // Add assistant response to messages
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div className="chat-interface">
      <div className="settings">
        <select 
          value={selectedProvider} 
          onChange={(e) => setSelectedProvider(e.target.value)}
        >
          <option value="">Select Provider</option>
          {providers.map(provider => (
            <option key={provider.name} value={provider.name}>
              {provider.display_name}
            </option>
          ))}
        </select>

        <select 
          value={selectedModel} 
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={!selectedProvider}
        >
          <option value="">Select Model</option>
          {providers
            .find(p => p.name === selectedProvider)
            ?.models.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
        </select>

        <input
          type="password"
          placeholder="API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="chat-history">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <strong>{msg.role}:</strong> {msg.content}
          </div>
        ))}
        {response && (
          <div className="message assistant streaming">
            <strong>assistant:</strong> {response}
          </div>
        )}
      </div>

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button onClick={handleSendMessage} disabled={loading}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {error && (
        <div className="error">
          Error: {error.message}
        </div>
      )}
    </div>
  );
}

/**
 * Vue.js Integration Example
 */
const VueChatComponent = {
  data() {
    return {
      client: new LLMClient(),
      providers: [],
      selectedProvider: '',
      selectedModel: '',
      apiKey: '',
      messages: [],
      input: '',
      response: '',
      loading: false,
      error: null
    };
  },
  
  async mounted() {
    try {
      this.providers = await this.client.getProviders();
    } catch (error) {
      this.error = error;
    }
  },

  computed: {
    availableModels() {
      const provider = this.providers.find(p => p.name === this.selectedProvider);
      return provider ? provider.models : [];
    }
  },

  methods: {
    async sendMessage() {
      if (!this.input.trim() || !this.selectedProvider || !this.selectedModel || !this.apiKey) {
        alert('Please fill in all fields');
        return;
      }

      const newMessages = [...this.messages, { role: 'user', content: this.input }];
      this.messages = newMessages;
      this.input = '';
      this.response = '';
      this.loading = true;
      this.error = null;

      const request = {
        provider: this.selectedProvider,
        model: this.selectedModel,
        messages: newMessages,
        api_key: this.apiKey,
        temperature: 0.7
      };

      try {
        await this.client.streamCompletion(
          request,
          (delta) => {
            this.response += delta;
          },
          () => {
            this.loading = false;
            this.messages.push({ role: 'assistant', content: this.response });
            this.response = '';
          },
          (error) => {
            this.loading = false;
            this.error = error;
          }
        );
      } catch (error) {
        this.loading = false;
        this.error = error;
      }
    }
  },

  template: `
    <div class="chat-interface">
      <div class="settings">
        <select v-model="selectedProvider">
          <option value="">Select Provider</option>
          <option v-for="provider in providers" :key="provider.name" :value="provider.name">
            {{ provider.display_name }}
          </option>
        </select>

        <select v-model="selectedModel" :disabled="!selectedProvider">
          <option value="">Select Model</option>
          <option v-for="model in availableModels" :key="model.id" :value="model.id">
            {{ model.name }}
          </option>
        </select>

        <input
          type="password"
          placeholder="API Key"
          v-model="apiKey"
        />
      </div>

      <div class="chat-history">
        <div v-for="(msg, i) in messages" :key="i" :class="'message ' + msg.role">
          <strong>{{ msg.role }}:</strong> {{ msg.content }}
        </div>
        <div v-if="response" class="message assistant streaming">
          <strong>assistant:</strong> {{ response }}
        </div>
      </div>

      <div class="input-area">
        <input
          type="text"
          v-model="input"
          @keyup.enter="sendMessage"
          placeholder="Type your message..."
          :disabled="loading"
        />
        <button @click="sendMessage" :disabled="loading">
          {{ loading ? 'Sending...' : 'Send' }}
        </button>
      </div>

      <div v-if="error" class="error">
        Error: {{ error.message }}
      </div>
    </div>
  `
};

/**
 * Vanilla JavaScript Example
 */
class SimpleChatApp {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.client = new LLMClient();
    this.providers = [];
    this.messages = [];
    this.init();
  }

  async init() {
    await this.loadProviders();
    this.render();
    this.attachEventListeners();
  }

  async loadProviders() {
    try {
      const response = await this.client.getProviders();
      this.providers = response.providers;
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="chat-app">
        <div class="settings">
          <select id="provider-select">
            <option value="">Select Provider</option>
            ${this.providers.map(p => `<option value="${p.name}">${p.display_name}</option>`).join('')}
          </select>
          <select id="model-select" disabled>
            <option value="">Select Model</option>
          </select>
          <input type="password" id="api-key" placeholder="API Key">
        </div>
        <div id="chat-history" class="chat-history"></div>
        <div class="input-area">
          <input type="text" id="message-input" placeholder="Type your message...">
          <button id="send-btn">Send</button>
        </div>
        <div id="error-message" class="error" style="display: none;"></div>
      </div>
    `;
  }

  attachEventListeners() {
    const providerSelect = document.getElementById('provider-select');
    const modelSelect = document.getElementById('model-select');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    providerSelect.addEventListener('change', (e) => {
      const provider = this.providers.find(p => p.name === e.target.value);
      modelSelect.disabled = !provider;
      modelSelect.innerHTML = '<option value="">Select Model</option>';
      
      if (provider) {
        provider.models.forEach(model => {
          modelSelect.innerHTML += `<option value="${model.id}">${model.name}</option>`;
        });
      }
    });

    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });
  }

  async sendMessage() {
    const provider = document.getElementById('provider-select').value;
    const model = document.getElementById('model-select').value;
    const apiKey = document.getElementById('api-key').value;
    const input = document.getElementById('message-input').value;

    if (!provider || !model || !apiKey || !input.trim()) {
      this.showError('Please fill in all fields');
      return;
    }

    this.messages.push({ role: 'user', content: input });
    this.updateChatHistory();
    document.getElementById('message-input').value = '';

    const request = {
      provider,
      model,
      messages: this.messages,
      api_key: apiKey,
      temperature: 0.7
    };

    const assistantMessage = { role: 'assistant', content: '' };
    this.messages.push(assistantMessage);
    this.updateChatHistory();

    try {
      await this.client.streamCompletion(
        request,
        (delta) => {
          assistantMessage.content += delta;
          this.updateChatHistory();
        },
        () => {
          console.log('Stream completed');
        },
        (error) => {
          this.showError(error.message);
          this.messages.pop(); // Remove incomplete assistant message
          this.updateChatHistory();
        }
      );
    } catch (error) {
      this.showError(error.message);
    }
  }

  updateChatHistory() {
    const chatHistory = document.getElementById('chat-history');
    chatHistory.innerHTML = this.messages.map(msg => 
      `<div class="message ${msg.role}"><strong>${msg.role}:</strong> ${msg.content}</div>`
    ).join('');
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
      errorDiv.style.display = 'none';
    }, 5000);
  }
}

// Initialize the vanilla JS app
// new SimpleChatApp('chat-container');

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LLMClient, useLLMAPI, VueChatComponent, SimpleChatApp };
}
