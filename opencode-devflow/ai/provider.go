package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type ProviderType string

const (
	ProviderAnthropic   ProviderType = "anthropic"
	ProviderClaudeCode ProviderType = "claudecode"
	ProviderOpenAI    ProviderType = "openai"
	ProviderGemini    ProviderType = "gemini"
	ProviderGroq      ProviderType = "groq"
	ProviderOpenRouter ProviderType = "openrouter"
	ProviderXAI       ProviderType = "xai"
	ProviderAzure     ProviderType = "azure"
	ProviderOllama    ProviderType = "ollama"
	ProviderLMStudio  ProviderType = "lmstudio"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type StreamChunk struct {
	Type    string `json:"type"`
	Content string `json:"content,omitempty`
	Error   string `json:"error,omitempty"`
	Done    bool   `json:"done"`
}

type Provider interface {
	Name() ProviderType
	SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error)
	SetAPIKey(apiKey string)
}

type Config struct {
	Providers map[ProviderType]*ProviderConfig `json:"providers"`
	Default   ProviderType                     `json:"default"`
}

type ProviderConfig struct {
	APIKey     string            `json:"api_key"`
	Endpoint   string            `json:"endpoint,omitempty"`
	Model      string            `json:"model"`
	MaxTokens  int               `json:"max_tokens"`
	Temperature float64          `json:"temperature"`
}

func DefaultConfig() *Config {
	return &Config{
		Providers: map[ProviderType]*ProviderConfig{
			ProviderAnthropic: {
				Model:      "claude-sonnet-4-20250514",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderClaudeCode: {
				Model:      "claude-sonnet-4-20250514",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderOpenAI: {
				Model:      "gpt-4o",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderGemini: {
				Model:      "gemini-2.0-flash",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderGroq: {
				Model:      "llama-3.3-70b-versatile",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderOpenRouter: {
				Model:      "anthropic/claude-3.5-sonnet",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderXAI: {
				Model:      "grok-2-1212",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderAzure: {
				Model:      "gpt-4o",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderOllama: {
				Model:      "llama3.2",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
			ProviderLMStudio: {
				Model:      "local-model",
				MaxTokens:  8192,
				Temperature: 0.7,
			},
		},
		Default: ProviderAnthropic,
	}
}

type Manager struct {
	providers map[ProviderType]Provider
	config    *Config
}

func NewManager(config *Config) *Manager {
	m := &Manager{
		providers: make(map[ProviderType]Provider),
		config:    config,
	}

	m.providers[ProviderAnthropic] = NewClaudeProvider()
	m.providers[ProviderClaudeCode] = NewClaudeCodeProvider()
	m.providers[ProviderOpenAI] = NewOpenAIProvider()
	m.providers[ProviderGemini] = NewGeminiProvider()
	m.providers[ProviderGroq] = NewGroqProvider()
	m.providers[ProviderOpenRouter] = NewOpenRouterProvider()
	m.providers[ProviderXAI] = NewXAIProvider()
	m.providers[ProviderAzure] = NewAzureProvider()
	m.providers[ProviderOllama] = NewOllamaProvider()
	m.providers[ProviderLMStudio] = NewLMStudioProvider()

	for pt, pc := range config.Providers {
		if p, ok := m.providers[pt]; ok {
			p.SetAPIKey(pc.APIKey)
		}
	}

	return m
}

func (m *Manager) GetProvider(name ProviderType) Provider {
	if p, ok := m.providers[name]; ok {
		return p
	}
	return m.providers[m.config.Default]
}

func (m *Manager) SendMessage(ctx context.Context, providerName ProviderType, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	provider := m.GetProvider(providerName)
	if provider == nil {
		return nil, fmt.Errorf("provider not found: %s", providerName)
	}
	return provider.SendMessage(ctx, messages, systemPrompt)
}

func (m *Manager) UpdateProviderConfig(pt ProviderType, apiKey, endpoint, model string) error {
	if pc, ok := m.config.Providers[pt]; ok {
		pc.APIKey = apiKey
		if endpoint != "" {
			pc.Endpoint = endpoint
		}
		if model != "" {
			pc.Model = model
		}
		if p, ok := m.providers[pt]; ok {
			p.SetAPIKey(apiKey)
		}
		return nil
	}
	return fmt.Errorf("unknown provider: %s", pt)
}

func (m *Manager) GetConfig() *Config {
	return m.config
}

// ============ Claude Provider ============

type ClaudeProvider struct {
	apiKey string
}

func NewClaudeProvider() *ClaudeProvider {
	return &ClaudeProvider{}
}

func (p *ClaudeProvider) Name() ProviderType { return ProviderAnthropic }

func (p *ClaudeProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *ClaudeProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("API key not set for Claude")
	}

	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		reqBody := map[string]interface{}{
			"model": "claude-sonnet-4-20250514",
			"max_tokens": 8192,
			"messages": messages,
			"stream": true,
		}
		if systemPrompt != "" {
			reqBody["system"] = systemPrompt
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST",
			"https://api.anthropic.com/v1/messages",
			strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-api-key", p.apiKey)
		req.Header.Set("anthropic-version", "2023-06-01")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		reader := io.NopCloser(resp.Body)
		dec := json.NewDecoder(reader)
		for {
			var event struct {
				Type string `json:"type"`
				Delta struct{ Text string `json:"text"` } `json:"delta"`
				Error struct{ Message string `json:"message"` } `json:"error"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}

			switch event.Type {
			case "content_block_delta":
				ch <- StreamChunk{Type: "message", Content: event.Delta.Text}
			case "error":
				ch <- StreamChunk{Type: "error", Error: event.Error.Message}
			case "message_stop":
				ch <- StreamChunk{Type: "done", Done: true}
			}
		}
	}()

	return ch, nil
}

// ============ Claude Code Provider (via OpenCode's API) ============

type ClaudeCodeProvider struct {
	apiKey string
}

func NewClaudeCodeProvider() *ClaudeCodeProvider {
	return &ClaudeCodeProvider{}
}

func (p *ClaudeCodeProvider) Name() ProviderType { return ProviderClaudeCode }

func (p *ClaudeCodeProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *ClaudeCodeProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)
		ch <- StreamChunk{Type: "message", Content: "[Claude Code Provider] Use OpenCode CLI or MCP for Claude Code features."}
		ch <- StreamChunk{Type: "done", Done: true}
	}()
	return ch, nil
}

// ============ OpenAI Provider ============

type OpenAIProvider struct {
	apiKey string
}

func NewOpenAIProvider() *OpenAIProvider {
	return &OpenAIProvider{}
}

func (p *OpenAIProvider) Name() ProviderType { return ProviderOpenAI }

func (p *OpenAIProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *OpenAIProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("API key not set for OpenAI")
	}

	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		msgs := make([]map[string]string, 0)
		if systemPrompt != "" {
			msgs = append(msgs, map[string]string{"role": "system", "content": systemPrompt})
		}
		for _, m := range messages {
			role := m.Role
			if role == "assistant" {
				role = "assistant"
			} else {
				role = "user"
			}
			msgs = append(msgs, map[string]string{"role": role, "content": m.Content})
		}

		reqBody := map[string]interface{}{
			"model": "gpt-4o",
			"messages": msgs,
			"stream": true,
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST",
			"https://api.openai.com/v1/chat/completions",
			strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		reader := io.NopCloser(resp.Body)
		dec := json.NewDecoder(reader)
		for {
			var event struct {
				Choices []struct {
					Delta struct{ Content string `json:"content"` } `json:"delta"`
				} `json:"choices"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}
			if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
				ch <- StreamChunk{Type: "message", Content: event.Choices[0].Delta.Content}
			}
		}
		ch <- StreamChunk{Type: "done", Done: true}
	}()

	return ch, nil
}

// ============ Gemini Provider ============

type GeminiProvider struct {
	apiKey string
}

func NewGeminiProvider() *GeminiProvider {
	return &GeminiProvider{}
}

func (p *GeminiProvider) Name() ProviderType { return ProviderGemini }

func (p *GeminiProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *GeminiProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("API key not set for Gemini")
	}

	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		contents := make([]map[string]string, 0)
		for _, m := range messages {
			role := "user"
			if m.Role == "assistant" {
				role = "model"
			}
			contents = append(contents, map[string]string{"role": role, "parts": fmt.Sprintf(`{"text":"%s"}`, m.Content)})
		}

		reqBody := map[string]interface{}{
			"contents":                  contents,
			"generationConfig": map[string]interface{}{
				"temperature":     0.9,
				"maxOutputTokens": 8192,
			},
		}
		if systemPrompt != "" {
			reqBody["system_instruction"] = map[string]string{"parts": fmt.Sprintf(`{"text":"%s"}`, systemPrompt)}
		}

		reqBytes, _ := json.Marshal(reqBody)
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=%s", p.apiKey)
		req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		dec := json.NewDecoder(resp.Body)
		for {
			var event struct {
				Candidates []struct {
					Content struct {
						Parts []struct{ Text string `json:"text"` } `json:"parts"`
					} `json:"content"`
				} `json:"candidates"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}
			if len(event.Candidates) > 0 && len(event.Candidates[0].Content.Parts) > 0 {
				ch <- StreamChunk{Type: "message", Content: event.Candidates[0].Content.Parts[0].Text}
			}
		}
		ch <- StreamChunk{Type: "done", Done: true}
	}()

	return ch, nil
}

// ============ Groq Provider ============

type GroqProvider struct {
	apiKey string
}

func NewGroqProvider() *GroqProvider {
	return &GroqProvider{}
}

func (p *GroqProvider) Name() ProviderType { return ProviderGroq }

func (p *GroqProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *GroqProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("API key not set for Groq")
	}

	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		msgs := make([]map[string]string, 0)
		if systemPrompt != "" {
			msgs = append(msgs, map[string]string{"role": "system", "content": systemPrompt})
		}
		for _, m := range messages {
			role := m.Role
			if role == "assistant" {
				role = "assistant"
			} else {
				role = "user"
			}
			msgs = append(msgs, map[string]string{"role": role, "content": m.Content})
		}

		reqBody := map[string]interface{}{
			"model":    "llama-3.3-70b-versatile",
			"messages": msgs,
			"stream":   true,
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST",
			"https://api.groq.com/openai/v1/chat/completions",
			strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		dec := json.NewDecoder(resp.Body)
		for {
			var event struct {
				Choices []struct {
					Delta struct{ Content string `json:"content"` } `json:"delta"`
				} `json:"choices"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}
			if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
				ch <- StreamChunk{Type: "message", Content: event.Choices[0].Delta.Content}
			}
		}
		ch <- StreamChunk{Type: "done", Done: true}
	}()

	return ch, nil
}

// ============ OpenRouter Provider ============

type OpenRouterProvider struct {
	apiKey string
}

func NewOpenRouterProvider() *OpenRouterProvider {
	return &OpenRouterProvider{}
}

func (p *OpenRouterProvider) Name() ProviderType { return ProviderOpenRouter }

func (p *OpenRouterProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *OpenRouterProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("API key not set for OpenRouter")
	}

	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		msgs := make([]map[string]string, 0)
		if systemPrompt != "" {
			msgs = append(msgs, map[string]string{"role": "system", "content": systemPrompt})
		}
		for _, m := range messages {
			role := m.Role
			if role == "assistant" {
				role = "assistant"
			} else {
				role = "user"
			}
			msgs = append(msgs, map[string]string{"role": role, "content": m.Content})
		}

		reqBody := map[string]interface{}{
			"model":    "anthropic/claude-3.5-sonnet",
			"messages": msgs,
			"stream":   true,
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST",
			"https://openrouter.ai/api/v1/chat/completions",
			strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))
		req.Header.Set("HTTP-Referer", "https://devflow.local")
		req.Header.Set("X-Title", "DevFlow")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		dec := json.NewDecoder(resp.Body)
		for {
			var event struct {
				Choices []struct {
					Delta struct{ Content string `json:"content"` } `json:"delta"`
				} `json:"choices"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}
			if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
				ch <- StreamChunk{Type: "message", Content: event.Choices[0].Delta.Content}
			}
		}
		ch <- StreamChunk{Type: "done", Done: true}
	}()

	return ch, nil
}

// ============ xAI Provider ============

type XAIProvider struct {
	apiKey string
}

func NewXAIProvider() *XAIProvider {
	return &XAIProvider{}
}

func (p *XAIProvider) Name() ProviderType { return ProviderXAI }

func (p *XAIProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *XAIProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("API key not set for xAI")
	}

	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		msgs := make([]map[string]string, 0)
		if systemPrompt != "" {
			msgs = append(msgs, map[string]string{"role": "system", "content": systemPrompt})
		}
		for _, m := range messages {
			role := m.Role
			if role == "assistant" {
				role = "assistant"
			} else {
				role = "user"
			}
			msgs = append(msgs, map[string]string{"role": role, "content": m.Content})
		}

		reqBody := map[string]interface{}{
			"model":    "grok-2-1212",
			"messages": msgs,
			"stream":   true,
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST",
			"https://api.x.ai/v1/chat/completions",
			strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		dec := json.NewDecoder(resp.Body)
		for {
			var event struct {
				Choices []struct {
					Delta struct{ Content string `json:"content"` } `json:"delta"`
				} `json:"choices"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}
			if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
				ch <- StreamChunk{Type: "message", Content: event.Choices[0].Delta.Content}
			}
		}
		ch <- StreamChunk{Type: "done", Done: true}
	}()

	return ch, nil
}

// ============ Azure OpenAI Provider ============

type AzureProvider struct {
	apiKey string
}

func NewAzureProvider() *AzureProvider {
	return &AzureProvider{}
}

func (p *AzureProvider) Name() ProviderType { return ProviderAzure }

func (p *AzureProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *AzureProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)
		ch <- StreamChunk{Type: "message", Content: "[Azure OpenAI] Please configure your Azure endpoint and deployment name."}
		ch <- StreamChunk{Type: "done", Done: true}
	}()
	return ch, nil
}

// ============ Ollama Provider ============

type OllamaProvider struct {
	apiKey string
}

func NewOllamaProvider() *OllamaProvider {
	return &OllamaProvider{}
}

func (p *OllamaProvider) Name() ProviderType { return ProviderOllama }

func (p *OllamaProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *OllamaProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		msgs := make([]map[string]string, 0)
		for _, m := range messages {
			role := m.Role
			if role == "assistant" {
				role = "assistant"
			} else {
				role = "user"
			}
			msgs = append(msgs, map[string]string{"role": role, "content": m.Content})
		}

		reqBody := map[string]interface{}{
			"model":    "llama3.2",
			"messages": msgs,
			"stream":   true,
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST",
			"http://localhost:11434/api/chat",
			strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		dec := json.NewDecoder(resp.Body)
		for {
			var event struct {
				Message struct{ Content string `json:"content"` } `json:"message"`
				Done    bool   `json:"done"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}
			if event.Message.Content != "" {
				ch <- StreamChunk{Type: "message", Content: event.Message.Content}
			}
			if event.Done {
				break
			}
		}
		ch <- StreamChunk{Type: "done", Done: true}
	}()

	return ch, nil
}

// ============ LM Studio Provider ============

type LMStudioProvider struct {
	apiKey string
}

func NewLMStudioProvider() *LMStudioProvider {
	return &LMStudioProvider{}
}

func (p *LMStudioProvider) Name() ProviderType { return ProviderLMStudio }

func (p *LMStudioProvider) SetAPIKey(apiKey string) { p.apiKey = apiKey }

func (p *LMStudioProvider) SendMessage(ctx context.Context, messages []Message, systemPrompt string) (<-chan StreamChunk, error) {
	ch := make(chan StreamChunk, 100)
	go func() {
		defer close(ch)

		msgs := make([]map[string]string, 0)
		for _, m := range messages {
			role := m.Role
			if role == "assistant" {
				role = "assistant"
			} else {
				role = "user"
			}
			msgs = append(msgs, map[string]string{"role": role, "content": m.Content})
		}

		reqBody := map[string]interface{}{
			"model":    "local-model",
			"messages": msgs,
			"stream":   true,
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST",
			"http://localhost:1234/v1/chat/completions",
			strings.NewReader(string(reqBytes)))
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			ch <- StreamChunk{Type: "error", Error: err.Error()}
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			body, _ := io.ReadAll(resp.Body)
			ch <- StreamChunk{Type: "error", Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}
			return
		}

		dec := json.NewDecoder(resp.Body)
		for {
			var event struct {
				Choices []struct {
					Delta struct{ Content string `json:"content"` } `json:"delta"`
				} `json:"choices"`
			}
			if err := dec.Decode(&event); err != nil {
				break
			}
			if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
				ch <- StreamChunk{Type: "message", Content: event.Choices[0].Delta.Content}
			}
		}
		ch <- StreamChunk{Type: "done", Done: true}
	}()

	return ch, nil
}
