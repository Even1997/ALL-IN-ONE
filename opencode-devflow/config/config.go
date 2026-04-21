package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type ConfigManager struct {
	path   string
	config *Config
	mu     sync.RWMutex
}

type Config struct {
	AI     AIConfig     `json:"ai"`
	Skills SkillsConfig `json:"skills"`
	UI     UIConfig     `json:"ui"`
}

type AIConfig struct {
	Providers map[string]ProviderConfig `json:"providers"`
	Default  string                   `json:"default"`
}

type ProviderConfig struct {
	APIKey    string `json:"api_key"`
	Endpoint  string `json:"endpoint,omitempty"`
	Model     string `json:"model,omitempty"`
	MaxTokens int    `json:"max_tokens,omitempty"`
}

type SkillsConfig struct {
	Roles map[string]RoleConfig `json:"roles"`
}

type RoleConfig struct {
	SystemPrompt string            `json:"system_prompt"`
	Skills       []SkillDefinition `json:"skills"`
}

type SkillDefinition struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Tools       []string `json:"tools"`
	Prompt      string   `json:"prompt"`
}

type UIConfig struct {
	Theme      string `json:"theme"`
	Language   string `json:"language"`
	SidebarPos string `json:"sidebar_pos"`
}

var ProviderDefinitions = []map[string]string{
	{
		"id":          "anthropic",
		"name":        "Claude (Anthropic)",
		"icon":        "🧠",
		"endpoint":    "https://api.anthropic.com/v1/messages",
		"defaultModel": "claude-sonnet-4-20250514",
	},
	{
		"id":          "openai",
		"name":        "OpenAI (GPT)",
		"icon":        "🤖",
		"endpoint":    "https://api.openai.com/v1/chat/completions",
		"defaultModel": "gpt-4o",
	},
	{
		"id":          "gemini",
		"name":        "Google Gemini",
		"icon":        "✨",
		"endpoint":    "https://generativelanguage.googleapis.com/v1beta/models",
		"defaultModel": "gemini-2.0-flash",
	},
	{
		"id":          "groq",
		"name":        "Groq",
		"icon":        "⚡",
		"endpoint":    "https://api.groq.com/openai/v1/chat/completions",
		"defaultModel": "llama-3.3-70b-versatile",
	},
	{
		"id":          "openrouter",
		"name":        "OpenRouter",
		"icon":        "🌐",
		"endpoint":    "https://openrouter.ai/api/v1/chat/completions",
		"defaultModel": "anthropic/claude-3.5-sonnet",
	},
	{
		"id":          "xai",
		"name":        "xAI (Grok)",
		"icon":        "🚀",
		"endpoint":    "https://api.x.ai/v1/chat/completions",
		"defaultModel": "grok-2-1212",
	},
	{
		"id":          "azure",
		"name":        "Azure OpenAI",
		"icon":        "☁️",
		"endpoint":    "",
		"defaultModel": "gpt-4o",
	},
	{
		"id":          "ollama",
		"name":        "Ollama (Local)",
		"icon":        "🏠",
		"endpoint":    "http://localhost:11434/api/chat",
		"defaultModel": "llama3.2",
	},
	{
		"id":          "lmstudio",
		"name":        "LM Studio (Local)",
		"icon":        "📚",
		"endpoint":    "http://localhost:1234/v1/chat/completions",
		"defaultModel": "local-model",
	},
	{
		"id":          "claudecode",
		"name":        "Claude Code (OpenCode)",
		"icon":        "💻",
		"endpoint":    "",
		"defaultModel": "claude-sonnet-4-20250514",
	},
}

var ModelDefinitions = map[string][]string{
	"anthropic": {
		"claude-opus-4-20250514",
		"claude-sonnet-4-20250514",
		"claude-3-5-sonnet-20241022",
		"claude-3-5-haiku-20241022",
		"claude-3-opus-20240229",
		"claude-3-sonnet-20240229",
		"claude-3-haiku-20240307",
	},
	"openai": {
		"gpt-4o",
		"gpt-4o-mini",
		"gpt-4-turbo",
		"gpt-3.5-turbo",
		"o1-preview",
		"o1-mini",
		"o3-mini",
	},
	"gemini": {
		"gemini-2.0-flash-exp",
		"gemini-2.0-flash",
		"gemini-1.5-pro",
		"gemini-1.5-flash",
		"gemini-1.5-flash-8b",
	},
	"groq": {
		"llama-3.3-70b-versatile",
		"llama-3.1-70b-versatile",
		"llama-3.2-90b-vision-preview",
		"mixtral-8x7b-32768",
		"gemma2-9b-it",
	},
	"openrouter": {
		"anthropic/claude-3.5-sonnet",
		"anthropic/claude-3-opus",
		"openai/gpt-4o",
		"openai/o1-preview",
		"google/gemini-pro-1.5",
		"meta-llama/llama-3.2-11b-vision-instruct",
		"mistralai/mistral-large-2411",
	},
	"xai": {
		"grok-2-1212",
		"grok-2-vision-1212",
		"grok-beta",
	},
	"azure": {
		"gpt-4o",
		"gpt-4-turbo",
		"gpt-4",
		"gpt-35-turbo",
	},
	"ollama": {
		"llama3.2",
		"llama3.1",
		"qwen2.5",
		"mistral",
		"codellama",
	},
	"lmstudio": {
		"local-model",
	},
	"claudecode": {
		"claude-sonnet-4-20250514",
		"claude-opus-4-20250514",
		"claude-3-5-sonnet-20241022",
	},
}

func GetProviderInfo(id string) map[string]string {
	for _, p := range ProviderDefinitions {
		if p["id"] == id {
			return p
		}
	}
	return nil
}

func GetModelsForProvider(provider string) []string {
	if models, ok := ModelDefinitions[provider]; ok {
		return models
	}
	return []string{}
}

func DefaultConfig() *Config {
	providers := make(map[string]ProviderConfig)
	for _, p := range ProviderDefinitions {
		providers[p["id"]] = ProviderConfig{
			Model: p["defaultModel"],
		}
	}

	return &Config{
		AI: AIConfig{
			Providers: providers,
			Default:   "anthropic",
		},
		Skills: SkillsConfig{
			Roles: map[string]RoleConfig{
				"product": {
					SystemPrompt: "You are a Product Manager assistant. Help with requirements analysis, user stories, specifications, and feature prioritization.",
					Skills: []SkillDefinition{
						{Name: "analyze_requirements", Description: "Analyze requirements", Tools: []string{"view", "grep"}},
						{Name: "write_user_story", Description: "Write user stories", Tools: []string{"write"}},
						{Name: "create_spec", Description: "Create product spec", Tools: []string{"write"}},
						{Name: "prioritize", Description: "Prioritize features", Tools: []string{}},
						{Name: "generate_prd", Description: "Generate PRD", Tools: []string{"write", "ls"}},
					},
				},
				"design": {
					SystemPrompt: "You are a UI/UX Designer assistant. Help with layouts, components, design systems, and accessibility.",
					Skills: []SkillDefinition{
						{Name: "layout_design", Description: "Design layouts", Tools: []string{"view", "write"}},
						{Name: "component_design", Description: "Design components", Tools: []string{"write", "edit"}},
						{Name: "design_system", Description: "Create design system", Tools: []string{"write", "glob"}},
						{Name: "accessibility_check", Description: "WCAG check", Tools: []string{"grep", "view"}},
					},
				},
				"develop": {
					SystemPrompt: "You are a Developer assistant. Help with writing code, refactoring, debugging, and API design.",
					Skills: []SkillDefinition{
						{Name: "write_code", Description: "Write code", Tools: []string{"view", "write", "edit"}},
						{Name: "refactor", Description: "Refactor code", Tools: []string{"view", "edit"}},
						{Name: "debug", Description: "Debug issues", Tools: []string{"view", "grep", "bash"}},
						{Name: "design_api", Description: "Design APIs", Tools: []string{"write", "glob"}},
						{Name: "write_tests", Description: "Write tests", Tools: []string{"write", "bash"}},
						{Name: "code_review", Description: "Review code", Tools: []string{"view", "grep"}},
					},
				},
				"test": {
					SystemPrompt: "You are a QA Engineer assistant. Help with test plans, test cases, bug reports, and test automation.",
					Skills: []SkillDefinition{
						{Name: "write_test_plan", Description: "Create test plan", Tools: []string{"write", "view"}},
						{Name: "write_test_cases", Description: "Write test cases", Tools: []string{"write", "edit"}},
						{Name: "report_bug", Description: "Report bugs", Tools: []string{"write"}},
						{Name: "test_strategy", Description: "Testing strategy", Tools: []string{"view", "grep"}},
						{Name: "automate_tests", Description: "Automate tests", Tools: []string{"write", "grep"}},
					},
				},
				"ops": {
					SystemPrompt: "You are a DevOps/Operations assistant. Help with CI/CD, Docker, Kubernetes, monitoring, and infrastructure.",
					Skills: []SkillDefinition{
						{Name: "ci_cd_pipeline", Description: "CI/CD pipeline", Tools: []string{"write", "glob", "bash"}},
						{Name: "dockerfile", Description: "Docker config", Tools: []string{"write", "edit"}},
						{Name: "k8s_manifest", Description: "K8s manifests", Tools: []string{"write", "edit"}},
						{Name: "monitoring", Description: "Monitoring", Tools: []string{"write", "grep"}},
						{Name: "infrastructure", Description: "IaC", Tools: []string{"write", "glob"}},
						{Name: "security_scan", Description: "Security checks", Tools: []string{"grep", "bash"}},
					},
				},
			},
		},
		UI: UIConfig{
			Theme:      "light",
			Language:   "zh-CN",
			SidebarPos: "left",
		},
	}
}

func NewConfigManager(path string) (*ConfigManager, error) {
	cm := &ConfigManager{
		path:   path,
		config: DefaultConfig(),
	}

	if path != "" {
		if err := cm.Load(); err != nil {
			if !os.IsNotExist(err) {
				return nil, err
			}
		}
	}

	return cm, nil
}

func (cm *ConfigManager) Load() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	data, err := os.ReadFile(cm.path)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, cm.config)
}

func (cm *ConfigManager) Save() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	data, err := json.MarshalIndent(cm.config, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(cm.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(cm.path, data, 0644)
}

func (cm *ConfigManager) Get() *Config {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	configCopy := *cm.config
	return &configCopy
}

func (cm *ConfigManager) UpdateAIProvider(provider, apiKey, endpoint, model string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if cm.config.AI.Providers == nil {
		cm.config.AI.Providers = make(map[string]ProviderConfig)
	}

	pc := cm.config.AI.Providers[provider]
	if apiKey != "" {
		pc.APIKey = apiKey
	}
	if endpoint != "" {
		pc.Endpoint = endpoint
	}
	if model != "" {
		pc.Model = model
	}
	cm.config.AI.Providers[provider] = pc

	data, err := json.MarshalIndent(cm.config, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(cm.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(cm.path, data, 0644)
}

func (cm *ConfigManager) SetDefaultProvider(provider string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	cm.config.AI.Default = provider

	data, err := json.MarshalIndent(cm.config, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(cm.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(cm.path, data, 0644)
}

func (cm *ConfigManager) GetProviderConfig(provider string) *ProviderConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if pc, ok := cm.config.AI.Providers[provider]; ok {
		return &pc
	}
	return nil
}

func (cm *ConfigManager) GetAllProviderConfigs() map[string]ProviderConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	result := make(map[string]ProviderConfig)
	for k, v := range cm.config.AI.Providers {
		result[k] = v
	}
	return result
}

func (cm *ConfigManager) GetSystemPrompt(role string) string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if roleCfg, ok := cm.config.Skills.Roles[role]; ok {
		return roleCfg.SystemPrompt
	}
	return ""
}

func (cm *ConfigManager) GetSkills(role string) []SkillDefinition {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if roleCfg, ok := cm.config.Skills.Roles[role]; ok {
		return roleCfg.Skills
	}
	return nil
}
