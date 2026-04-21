package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/opencode-ai/opencode-devflow/ai"
	"github.com/opencode-ai/opencode-devflow/config"
	"github.com/opencode-ai/opencode-devflow/store"
)

// ============ Types ============

type Server struct {
	projects     map[string]*Project
	projectMutex sync.RWMutex
	sessions     map[string]*Session
	sessionMutex sync.RWMutex
	httpServer   *http.Server
	toolRunner   *ToolRunner
	configMgr    *config.ConfigManager
	aiManager    *ai.Manager
	featureStore *store.FeatureStore
}

type Project struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
	Role string `json:"role"`
}

type Session struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Role      string    `json:"role"`
	Messages  []Message `json:"messages"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"` // user, assistant, tool
	Content   string    `json:"content"`
	ToolName  string    `json:"tool_name,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

type AIRequest struct {
	SessionID string `json:"session_id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
}

type SSEvent struct {
	Type string `json:"type"`
	Data interface{} `json:"data"`
}

func convertToAIConfig(cfg *config.Config) *ai.Config {
	aiCfg := &ai.Config{
		Providers: make(map[ai.ProviderType]*ai.ProviderConfig),
		Default:   ai.ProviderType(cfg.AI.Default),
	}
	for name, pc := range cfg.AI.Providers {
		aiCfg.Providers[ai.ProviderType(name)] = &ai.ProviderConfig{
			APIKey: pc.APIKey,
			Endpoint: pc.Endpoint,
			Model: pc.Model,
			MaxTokens: 8192,
			Temperature: 0.7,
		}
	}
	return aiCfg
}

// ============ Main ============

func main() {
	log.SetFlags(0)
	log.Println("🚀 DevFlow 服务器启动中...")

	// Initialize config
	homeDir, _ := os.UserHomeDir()
	configPath := filepath.Join(homeDir, ".devflow", "config.json")
	configMgr, err := config.NewConfigManager(configPath)
	if err != nil {
		log.Printf("⚠️ 配置加载失败: %v", err)
		configMgr, _ = config.NewConfigManager("")
	}

	// Initialize AI manager
	aiConfig := convertToAIConfig(configMgr.Get())
	aiManager := ai.NewManager(aiConfig)

log.Printf("📡 AI 提供商: Claude, ClaudeCode, MiniMax, OpenAI, Gemini")

	// Initialize feature store (data stored in ~/.devflow/data/features.md)
	featureDataDir := filepath.Join(homeDir, ".devflow", "data")
	featureStore, err := store.NewFeatureStore(featureDataDir)
	if err != nil {
		log.Printf("⚠️ 功能模块初始化失败: %v", err)
	}

	srv := &Server{
		projects:     make(map[string]*Project),
		sessions:     make(map[string]*Session),
		toolRunner:   NewToolRunner("."),
		configMgr:    configMgr,
		aiManager:    aiManager,
		featureStore: featureStore,
	}

	// Initialize demo project
	srv.projects["demo"] = &Project{
		ID:   "demo",
		Name: "我的项目",
		Path: ".",
		Role: "develop",
	}

	// Create default session
	srv.sessions["default"] = &Session{
		ID:        "default",
		Title:     "默认会话",
		Role:      "develop",
		Messages:  []Message{},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Setup routes
	mux := http.NewServeMux()
	srv.registerRoutes(mux)

	port := 8081
	srv.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 300 * time.Second, // Long timeout for SSE
	}

	log.Printf("📍 访问地址: http://localhost:%d", port)
	log.Printf("📋 角色视图:")
	log.Printf("   首页:     http://localhost:%d/", port)
	log.Printf("   产品经理: http://localhost:%d/product", port)
	log.Printf("   UI 设计:   http://localhost:%d/design", port)
	log.Printf("   开发:     http://localhost:%d/develop", port)
	log.Printf("   测试:     http://localhost:%d/test", port)
	log.Printf("   运营:     http://localhost:%d/operations", port)
	log.Printf("🤖 伴随式AI: 所有角色视图均可用")

	if err := srv.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

// ============ Routes ============

func (s *Server) registerRoutes(mux *http.ServeMux) {
	// API routes
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/projects", s.handleListProjects)
	mux.HandleFunc("POST /api/projects", s.handleCreateProject)
	mux.HandleFunc("GET /api/sessions", s.handleListSessions)
	mux.HandleFunc("POST /api/sessions", s.handleCreateSession)
	mux.HandleFunc("GET /api/sessions/", s.handleGetSession)
	mux.HandleFunc("DELETE /api/sessions/", s.handleDeleteSession)

	// Config API routes
	mux.HandleFunc("GET /api/config", s.handleGetConfig)
	mux.HandleFunc("PUT /api/config/provider", s.handleUpdateProvider)
	mux.HandleFunc("PUT /api/config/default", s.handleSetDefaultProvider)
	mux.HandleFunc("GET /api/config/providers", s.handleListProviders)

	// Feature store API (features.md)
	mux.HandleFunc("GET /api/features", s.handleGetFeatures)
	mux.HandleFunc("POST /api/features", s.handleCreateFeature)
	mux.HandleFunc("GET /api/features/", s.handleGetFeature)
	mux.HandleFunc("PUT /api/features/", s.handleUpdateFeature)
	mux.HandleFunc("DELETE /api/features/", s.handleDeleteFeature)
	mux.HandleFunc("GET /api/features/md", s.handleGetFeaturesMD)

	// AI SSE endpoint (伴随式AI核心)
	mux.HandleFunc("POST /api/ai/chat", s.handleAIChat)
	mux.HandleFunc("GET /api/ai/stream", s.handleAIStream)
	mux.HandleFunc("POST /api/ai/stream", s.handleAIStream)

	// Role views
	mux.HandleFunc("GET /", s.handleIndex)
	mux.HandleFunc("GET /product", s.handleProductView)
	mux.HandleFunc("GET /design", s.handleDesignView)
	mux.HandleFunc("GET /develop", s.handleDevelopView)
	mux.HandleFunc("GET /test", s.handleTestView)
	mux.HandleFunc("GET /operations", s.handleOperationsView)
	mux.HandleFunc("GET /settings", s.handleSettingsView)
}

// ============ API Handlers ============

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"version":    "1.0.0-devflow",
		"opencode":    "ready",
		"ai":         "ready",
		"伴随式AI":   "所有角色可用",
	})
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	s.projectMutex.RLock()
	defer s.projectMutex.RUnlock()

	projects := make([]*Project, 0, len(s.projects))
	for _, p := range s.projects {
		projects = append(projects, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": projects})
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	var proj Project
	if err := json.NewDecoder(r.Body).Decode(&proj); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	s.projectMutex.Lock()
	s.projects[proj.ID] = &proj
	s.projectMutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(proj)
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	s.sessionMutex.RLock()
	defer s.sessionMutex.RUnlock()

	sessions := make([]*Session, 0, len(s.sessions))
	for _, sess := range s.sessions {
		sessions = append(sessions, sess)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"sessions": sessions})
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title string `json:"title"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if req.Title == "" {
		req.Title = "新会话"
	}
	if req.Role == "" {
		req.Role = "develop"
	}

	sessionID := fmt.Sprintf("sess_%d", time.Now().UnixNano())
	sess := &Session{
		ID:        sessionID,
		Title:     req.Title,
		Role:      req.Role,
		Messages:  []Message{},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	s.sessionMutex.Lock()
	s.sessions[sessionID] = sess
	s.sessionMutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sess)
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Path[len("/api/sessions/"):]

	s.sessionMutex.RLock()
	sess, ok := s.sessions[sessionID]
	s.sessionMutex.RUnlock()

	if !ok {
		http.Error(w, "Session not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sess)
}

func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Path[len("/api/sessions/"):]

	s.sessionMutex.Lock()
	delete(s.sessions, sessionID)
	s.sessionMutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// ============ Config Handlers ============

func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg := s.configMgr.Get()

	// Mask API keys in response
	providers := make(map[string]map[string]string)
	for name, pc := range cfg.AI.Providers {
		providers[name] = map[string]string{
			"api_key": maskAPIKey(pc.APIKey),
			"endpoint": pc.Endpoint,
			"model":    pc.Model,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"providers": providers,
		"default":   cfg.AI.Default,
		"skills":    cfg.Skills.Roles,
	})
}

func (s *Server) handleUpdateProvider(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string `json:"provider"`
		APIKey   string `json:"api_key"`
		Endpoint string `json:"endpoint"`
		Model    string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if err := s.configMgr.UpdateAIProvider(req.Provider, req.APIKey, req.Endpoint, req.Model); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
}

func (s *Server) handleSetDefaultProvider(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string `json:"provider"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if err := s.configMgr.SetDefaultProvider(req.Provider); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "default": req.Provider})
}

func (s *Server) handleListProviders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"providers": config.ProviderDefinitions,
		"models":   config.ModelDefinitions,
		"default":  s.configMgr.Get().AI.Default,
	})
}

// ============ Feature Store API ============

func (s *Server) handleGetFeatures(w http.ResponseWriter, r *http.Request) {
	if s.featureStore == nil {
		http.Error(w, "feature store not initialized", 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"features": s.featureStore.GetAll(),
		"path":     s.featureStore.Path(),
	})
}

func (s *Server) handleCreateFeature(w http.ResponseWriter, r *http.Request) {
	if s.featureStore == nil {
		http.Error(w, "feature store not initialized", 500)
		return
	}
	var f struct {
		Name     string `json:"name"`
		Level    string `json:"level"`
		Desc     string `json:"desc"`
		Parent   string `json:"parent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	levelText := map[string]string{"critical": "紧急", "high": "高", "medium": "中", "low": "低"}[f.Level]
	if levelText == "" {
		levelText = "中"
	}

	feature := &store.Feature{
		ID:        "f_" + fmt.Sprintf("%d", time.Now().UnixNano()),
		Name:      f.Name,
		Level:     f.Level,
		LevelText: levelText,
		Desc:      f.Desc,
		Parent:    f.Parent,
	}

	if err := s.featureStore.Create(feature); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(feature)
}

func (s *Server) handleGetFeature(w http.ResponseWriter, r *http.Request) {
	if s.featureStore == nil {
		http.Error(w, "feature store not initialized", 500)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/features/")
	f := s.featureStore.GetByID(id)
	if f == nil {
		http.Error(w, "feature not found", 404)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(f)
}

func (s *Server) handleUpdateFeature(w http.ResponseWriter, r *http.Request) {
	if s.featureStore == nil {
		http.Error(w, "feature store not initialized", 500)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/features/")

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Map levelText if provided
	if level, ok := updates["level"].(string); ok {
		levelText := map[string]string{"critical": "紧急", "high": "高", "medium": "中", "low": "低"}[level]
		if levelText != "" {
			updates["levelText"] = levelText
		}
	}

	if err := s.featureStore.Update(id, updates); err != nil {
		http.Error(w, err.Error(), 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(s.featureStore.GetByID(id))
}

func (s *Server) handleDeleteFeature(w http.ResponseWriter, r *http.Request) {
	if s.featureStore == nil {
		http.Error(w, "feature store not initialized", 500)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/features/")
	if err := s.featureStore.Delete(id); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.WriteHeader(204)
}

func (s *Server) handleGetFeaturesMD(w http.ResponseWriter, r *http.Request) {
	if s.featureStore == nil {
		http.Error(w, "feature store not initialized", 500)
		return
	}
	http.ServeFile(w, r, s.featureStore.Path())
}

func maskAPIKey(key string) string {
	if len(key) <= 8 {
		return "***"
	}
	return key[:4] + "***" + key[len(key)-4:]
}

// ============ AI Chat Handler (SSE) ============

func (s *Server) handleAIChat(w http.ResponseWriter, r *http.Request) {
	var req AIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Get or create session
	s.sessionMutex.Lock()
	sess, ok := s.sessions[req.SessionID]
	if !ok {
		sess = &Session{
			ID:        req.SessionID,
			Title:     "新会话",
			Role:      req.Role,
			Messages:  []Message{},
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		s.sessions[req.SessionID] = sess
	}

	// Add user message
	userMsg := Message{
		ID:        fmt.Sprintf("msg_%d", time.Now().UnixNano()),
		Role:      "user",
		Content:   req.Content,
		Timestamp: time.Now(),
	}
	sess.Messages = append(sess.Messages, userMsg)
	s.sessionMutex.Unlock()

	// Send immediate response - will be upgraded to SSE
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status": "processing", "stream": "/api/ai/stream?session=` + req.SessionID + `"}`))
}

func (s *Server) handleAIStream(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		sessionID = "default"
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", 500)
		return
	}

	// Get session messages
	s.sessionMutex.RLock()
	sess, ok := s.sessions[sessionID]
	s.sessionMutex.RUnlock()

	var userContent string
	if ok && len(sess.Messages) > 0 {
		userContent = sess.Messages[len(sess.Messages)-1].Content
	}

	// Simulate AI response stream (in production, connect to real LLM)
	aiResponse := s.generateAIResponse(sessionID, userContent)

	// Stream the response
	for _, chunk := range aiResponse {
		event := fmt.Sprintf("event: message\ndata: %s\n\n", chunk)
		w.Write([]byte(event))
		flusher.Flush()
		time.Sleep(10 * time.Millisecond)
	}

	// Send final message and save to session
	finalMsg := Message{
		ID:        fmt.Sprintf("msg_%d", time.Now().UnixNano()),
		Role:      "assistant",
		Content:   aiResponse[len(aiResponse)-1],
		Timestamp: time.Now(),
	}

	s.sessionMutex.Lock()
	if sess, ok := s.sessions[sessionID]; ok {
		sess.Messages = append(sess.Messages, finalMsg)
		sess.UpdatedAt = time.Now()
	}
	s.sessionMutex.Unlock()

	// Send done event
	w.Write([]byte("event: done\ndata: {\"status\":\"complete\"}\n\n"))
	flusher.Flush()
}

func (s *Server) generateAIResponse(sessionID, userContent string) []string {
	responses := []string{}

	// Check if user wants to use a specific tool
	content := strings.ToLower(strings.TrimSpace(userContent))

	// Detect tool commands
	// Handle single-word commands first
	if content == "ls" || content == "dir" || content == "列出" {
		toolResult := s.toolRunner.ExecuteTool("ls", map[string]interface{}{"path": "."})
		responses = append(responses, fmt.Sprintf(`{"type":"tool","tool":"ls","content":"%s"}`, escapeJSON(toolResult.Content)))
		return responses
	}

	if content == "view" || content == "查看" || content == "cat" {
		responses = append(responses, `{"type":"assistant","content":"请指定要查看的文件路径，例如：view main.go"}`)
		return responses
	}

	if content == "pwd" || content == "当前目录" {
		toolResult := s.toolRunner.ExecuteTool("bash", map[string]interface{}{"command": "pwd"})
		responses = append(responses, fmt.Sprintf(`{"type":"tool","tool":"bash","content":"%s"}`, escapeJSON(toolResult.Content)))
		return responses
	}

	// Handle commands with arguments
	if strings.HasPrefix(content, "view ") || strings.HasPrefix(content, "查看 ") || strings.HasPrefix(content, "cat ") {
		// Extract file path
		parts := strings.Fields(userContent)
		if len(parts) >= 2 {
			filePath := parts[len(parts)-1]
			if filePath == "cat" && len(parts) >= 3 {
				filePath = parts[len(parts)-1]
			}
			toolResult := s.toolRunner.ExecuteTool("view", map[string]interface{}{"file_path": filePath})
			if toolResult.Success {
				responses = append(responses, fmt.Sprintf(`{"type":"tool","tool":"view","content":"%s"}`, escapeJSON(toolResult.Content)))
				responses = append(responses, fmt.Sprintf(`{"type":"assistant","content":"文件 %s 内容如上。还需要什么帮助？"}`, filePath))
				return responses
			} else {
				responses = append(responses, fmt.Sprintf(`{"type":"error","content":"%s"}`, escapeJSON(toolResult.Error)))
				return responses
			}
		}
	}

	if strings.HasPrefix(content, "ls ") || strings.HasPrefix(content, "dir ") || strings.HasPrefix(content, "列出 ") {
		path := "."
		parts := strings.Fields(userContent)
		if len(parts) >= 2 {
			path = parts[len(parts)-1]
		}
		toolResult := s.toolRunner.ExecuteTool("ls", map[string]interface{}{"path": path})
		responses = append(responses, fmt.Sprintf(`{"type":"tool","tool":"ls","content":"%s"}`, escapeJSON(toolResult.Content)))
		return responses
	}

	if strings.HasPrefix(content, "grep ") || strings.HasPrefix(content, "搜索 ") {
		parts := strings.Fields(userContent)
		if len(parts) >= 2 {
			pattern := parts[len(parts)-1]
			// Check for -r flag or path
			path := "."
			for i := 1; i < len(parts)-1; i++ {
				if parts[i] == "-r" || parts[i] == "-l" {
					if i+1 < len(parts) {
						path = parts[i+1]
						break
					}
				}
			}
			toolResult := s.toolRunner.ExecuteTool("grep", map[string]interface{}{"pattern": pattern, "path": path})
			responses = append(responses, fmt.Sprintf(`{"type":"tool","tool":"grep","content":"%s"}`, escapeJSON(toolResult.Content)))
			return responses
		}
	}

	if strings.HasPrefix(content, "bash ") || strings.HasPrefix(content, "sh ") || strings.HasPrefix(content, "$") || strings.HasPrefix(content, "运行 ") {
		// Extract command
		cmd := strings.TrimPrefix(userContent, "bash ")
		cmd = strings.TrimPrefix(cmd, "sh ")
		cmd = strings.TrimPrefix(cmd, "$ ")
		cmd = strings.TrimPrefix(cmd, "运行 ")
		cmd = strings.TrimSpace(cmd)
		if cmd != "" {
			toolResult := s.toolRunner.ExecuteTool("bash", map[string]interface{}{"command": cmd})
			content := toolResult.Content
			if toolResult.Error != "" {
				content = content + "\nError: " + toolResult.Error
			}
			responses = append(responses, fmt.Sprintf(`{"type":"tool","tool":"bash","content":"%s"}`, escapeJSON(content)))
			return responses
		}
	}

	// Default: provide contextual help based on role
	s.sessionMutex.RLock()
	sess, _ := s.sessions[sessionID]
	role := "develop"
	if sess != nil {
		role = sess.Role
	}
	s.sessionMutex.RUnlock()

	responses = append(responses, `{"type":"thinking","content":"分析请求中..."}`)
	responses = append(responses, `{"type":"text","content":"好的，我来帮你。"}`)

	response := s.getContextualResponse(role, userContent)
	responses = append(responses, response)

	return responses
}

func (s *Server) getContextualResponse(role, userContent string) string {
	content := strings.ToLower(userContent)

	switch role {
	case "product":
		if strings.Contains(content, "分析") || strings.Contains(content, "需求") {
			return `{"type":"assistant","content":"作为产品经理AI，我可以帮你：\n\n📋 **需求分析**\n• 分析功能可行性\n• 拆解用户故事\n• 评估优先级\n\n请描述你的需求，我来帮你分析。"}`
		}
		if strings.Contains(content, "清单") || strings.Contains(content, "功能") {
			return `{"type":"assistant","content":"我来帮你生成功能清单：\n\n🎯 **功能清单模板**\n\n| 功能 | 优先级 | 状态 | 负责人 |\n|------|--------|------|--------|\n| 用户登录 | P0 | 待开发 | - |\n| 用户注册 | P0 | 待开发 | - |\n| ... | ... | ... | ... |\n\n需要我帮你创建具体的功能清单吗？"}`
		}
		return `{"type":"assistant","content":"👋 你好！我是产品经理AI助手。\n\n我可以帮你：\n• 分析需求文档\n• 生成功能清单\n• 评估工作量\n• 编写PRD\n\n请告诉我你需要什么帮助？"}`

	case "design":
		if strings.Contains(content, "布局") || strings.Contains(content, "设计") {
			return `{"type":"assistant","content":"🎨 根据你的需求，我推荐以下布局方案：\n\n**登录页面建议布局：**\n[  Logo  ]\n[ 用户名 ]\n[ 密码   ]\n[ 登录   ]\n[ 忘记密码]\n\n需要我生成具体的组件代码吗？"}`
		}
		if strings.Contains(content, "配色") {
			return `{"type":"assistant","content":"🎨 推荐配色方案：\n\n**主色调：**\n- Primary: #007AFF (蓝色)\n- Secondary: #5856D6 (紫色)\n\n**背景色：**\n- Light: #F5F5F7\n- Dark: #1E1E1E\n\n**成功/错误：**\n- Success: #28C840\n- Error: #FF3B30\n\n需要我应用到设计稿吗？"}`
		}
		return `{"type":"assistant","content":"👋 你好！我是UI设计AI助手。\n\n我可以帮你：\n• 推荐组件布局\n• 提供配色方案\n• 优化用户体验\n\n描述你的设计需求，我来给你建议！"}`

	case "develop":
		if strings.Contains(content, "写") || strings.Contains(content, "创建") || strings.Contains(content, "新建") {
			return `{"type":"assistant","content":"💻 我可以使用以下OpenCode工具帮你：\n\n**可用工具：**\n- view <文件> - 查看文件内容\n- write <文件> - 写入文件\n- edit <文件> - 编辑文件\n- ls <目录> - 列出目录\n- grep <模式> - 搜索\n- bash <命令> - 执行命令\n\n例如：告诉我 帮我创建 main.go 或 view main.go"}`
		}
		return `{"type":"assistant","content":"🤖 你好！我是OpenCode开发助手。\n\n**我的工具：**\n- view <文件> - 读取文件\n- write <文件> - 写入文件\n- edit <文件> - 编辑文件\n- ls - 列出目录\n- grep <pattern> - 搜索\n- bash <命令> - 执行命令\n\n直接告诉我你想做什么，比如：\n- view main.go\n- 帮我写一个 HTTP 服务器\n- 搜索 error 处理"}`

	case "test":
		if strings.Contains(content, "用例") || strings.Contains(content, "测试") {
			return `{"type":"assistant","content":"🧪 我来帮你生成测试用例：\n\n**用户登录测试用例：**\n\n| ID | 用例名称 | 预置条件 | 测试步骤 | 预期结果 |\n|----|----------|----------|----------|----------|\n| TC01 | 正常登录 | 用户已注册 | 1.输入正确账号密码 2.点击登录 | 登录成功 |\n| TC02 | 密码错误 | 用户已注册 | 1.输入正确账号 2.输入错误密码 | 提示密码错误 |\n| TC03 | 用户不存在 | - | 1.输入不存在账号 | 提示用户不存在 |\n\n需要我生成自动化测试脚本吗？"}`
		}
		if strings.Contains(content, "bug") || strings.Contains(content, "错误") {
			return `{"type":"assistant","content":"🔍 请粘贴Bug信息，我可以帮你：\n\n• 分析Bug根因\n• 提供修复建议\n• 生成修复代码\n\n**Bug分析模板：**\n1. 错误信息：\n2. 复现步骤：\n3. 发生环境：\n4. 相关代码："}`
		}
		return `{"type":"assistant","content":"👋 你好！我是测试AI助手。\n\n我可以帮你：\n• 生成测试用例\n• 分析Bug原因\n• 提供修复建议\n\n请描述你的问题或粘贴Bug信息！"}`

	case "operations":
		if strings.Contains(content, "部署") || strings.Contains(content, "发布") {
			return `{"type":"assistant","content":"🚀 部署方案推荐：\n\n**预发环境部署：**\n1. 构建项目: npm run build\n2. 部署到预发服务器\n3. 执行冒烟测试\n\n**生产环境部署：**\n1. 拉取最新代码\n2. 执行构建\n3. 滚动更新\n\n**推荐流程：**\n$ npm run build && ./deploy.sh staging\n\n需要我帮你执行部署吗？"}`
		}
		if strings.Contains(content, "性能") || strings.Contains(content, "优化") {
			return `{"type":"assistant","content":"📊 性能优化建议：\n\n**前端优化：**\n• 启用代码分割\n• 图片压缩和懒加载\n• 启用GZIP压缩\n• 使用CDN加速\n\n**后端优化：**\n• 启用缓存\n• 数据库连接池\n• 异步处理\n\n**监控指标：**\n• TTFB < 200ms\n• FCP < 1.8s\n• LCP < 2.5s\n\n需要我帮你分析具体性能问题吗？"}`
		}
		return `{"type":"assistant","content":"👋 你好！我是运营AI助手。\n\n我可以帮你：\n• 推荐部署方案\n• 优化构建流程\n• 分析性能问题\n\n请选择你的部署目标或描述问题！"}`
	}

	return `{"type":"assistant","content":"你好！我是DevFlow的AI助手。\n\n我可以帮你在所有角色中提供帮助：\n• 📋 产品经理 - 需求分析、功能清单\n• 🎨 UI设计 - 布局建议、配色方案\n• 💻 开发 - OpenCode工具、代码编写\n• 🧪 测试 - 用例生成、Bug分析\n• 🚀 运营 - 部署方案、性能优化\n\n请问有什么可以帮助你的？"}`
}

func escapeJSON(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\r", "\\r")
	s = strings.ReplaceAll(s, "\t", "\\t")
	return s
}

// ============ View Handlers ============

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow - 可视化软件开发平台</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
        }
        .header { background: rgba(0,0,0,0.2); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 18px; font-weight: 600; }
        .nav { display: flex; gap: 8px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; opacity: 0.7; transition: all 0.2s; }
        .nav a:hover, .nav a.active { opacity: 1; background: rgba(255,255,255,0.1); }
        .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
        h1 { font-size: 56px; font-weight: 700; margin-bottom: 16px; background: linear-gradient(90deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .subtitle { font-size: 20px; color: #888; margin-bottom: 60px; }
        .roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; }
        .role-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 32px; text-decoration: none; color: #fff; transition: all 0.3s ease; cursor: pointer; }
        .role-card:hover { background: rgba(255,255,255,0.1); transform: translateY(-8px); border-color: rgba(0,122,255,0.5); }
        .role-icon { font-size: 56px; margin-bottom: 20px; }
        .role-name { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
        .role-desc { font-size: 14px; color: #888; }
        .role-ai { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 12px; color: #28c840; }
        .status { margin-top: 60px; padding: 24px; background: rgba(40,200,64,0.1); border: 1px solid rgba(40,200,64,0.3); border-radius: 16px; color: #28c840; display: flex; align-items: center; gap: 12px; }
        .status-icon { font-size: 24px; }
        .footer { margin-top: 60px; text-align: center; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>DevFlow</h1>
        <nav class="nav">
            <a href="/" class="active">首页</a>
            <a href="/settings">设置</a>
        </nav>
    </div>
    <div class="container">
        <h1>DevFlow</h1>
        <p class="subtitle">基于 OpenCode 构建的可视化软件开发平台</p>

        <div class="roles">
            <div onclick="location.href='/product'" class="role-card">
                <div class="role-icon">📋</div>
                <div class="role-name">产品经理</div>
                <div class="role-desc">需求文档、原型评审、功能清单</div>
                <div class="role-ai">🤖 伴随式AI可用</div>
            </div>
            <div onclick="location.href='/design'" class="role-card">
                <div class="role-icon">🎨</div>
                <div class="role-name">UI 设计</div>
                <div class="role-desc">组件库、设计画布、属性编辑</div>
                <div class="role-ai">🤖 伴随式AI可用</div>
            </div>
            <div onclick="location.href='/develop'" class="role-card">
                <div class="role-icon">💻</div>
                <div class="role-name">开 发</div>
                <div class="role-desc">AI 编码、文件管理、终端</div>
                <div class="role-ai">🤖 伴随式AI可用</div>
            </div>
            <div onclick="location.href='/test'" class="role-card">
                <div class="role-icon">🧪</div>
                <div class="role-name">测 试</div>
                <div class="role-desc">用例管理、Bug 追踪、报告</div>
                <div class="role-ai">🤖 伴随式AI可用</div>
            </div>
            <div onclick="location.href='/operations'" class="role-card">
                <div class="role-icon">🚀</div>
                <div class="role-name">运 营</div>
                <div class="role-desc">部署、构建、监控</div>
                <div class="role-ai">🤖 伴随式AI可用</div>
            </div>
        </div>

        <div class="status">
            <span class="status-icon">✓</span>
            <div>
                <strong>🤖 伴随式AI已就绪</strong><br>
                <span style="font-size: 14px;">每个角色都可以使用AI助手，无需切换 - OpenCode工具系统已集成</span>
            </div>
        </div>

        <div class="footer">
            <p>Powered by OpenCode + DevFlow Architecture</p>
        </div>
    </div>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (s *Server) handleProductView(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow - 产品经理</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f7; color: #1d1d1f; height: 100vh; overflow: hidden; }
        .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 20px; font-weight: 600; }
        .nav { display: flex; gap: 8px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; opacity: 0.7; transition: all 0.2s; }
        .nav a:hover, .nav a.active { opacity: 1; background: rgba(255,255,255,0.1); }
        .nav a.settings { background: rgba(255,149,0,0.2); color: #ff9500; }
        .nav a.settings:hover { background: rgba(255,149,0,0.3); opacity: 1; }
        .main { display: grid; grid-template-columns: 280px 1fr 380px; height: calc(100vh - 60px); }
        /* Drawer */
        .drawer { background: white; border-right: 1px solid #e5e5e7; display: flex; flex-direction: column; }
        .drawer-tabs { display: flex; border-bottom: 1px solid #e5e5e7; }
        .drawer-tab { flex: 1; padding: 12px; text-align: center; font-size: 14px; font-weight: 500; color: #86868b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .drawer-tab:hover { color: #1d1d1f; }
        .drawer-tab.active { color: #007aff; border-bottom-color: #007aff; }
        .drawer-content { flex: 1; overflow-y: auto; padding: 16px; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        /* Requirements */
        .upload-area { border: 2px dashed #e5e5e7; border-radius: 12px; padding: 24px; text-align: center; cursor: pointer; transition: all 0.2s; }
        .upload-area:hover { border-color: #007aff; background: rgba(0,122,255,0.05); }
        .upload-icon { font-size: 32px; margin-bottom: 8px; }
        .upload-text { font-size: 14px; color: #86868b; }
        .file-list { margin-top: 16px; }
        .file-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f5f7; border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }
        .file-item:hover { background: #e8e8ed; }
        .file-icon { font-size: 18px; }
        .file-info { flex: 1; overflow: hidden; }
        .file-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-meta { font-size: 11px; color: #86868b; }
        /* Feature Tree */
        .feature-tree { }
        .tree-empty { text-align: center; padding: 40px 20px; color: #86868b; font-size: 14px; }
        .tree-node { margin-bottom: 4px; }
        .tree-node-header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: #f5f5f7; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
        .tree-node-header:hover { background: #e8e8ed; }
        .tree-node-header.selected { background: rgba(0,122,255,0.1); border: 1px solid #007aff; }
        .tree-toggle { font-size: 10px; color: #86868b; width: 16px; text-align: center; }
        .tree-icon { font-size: 14px; }
        .tree-label { flex: 1; font-size: 13px; font-weight: 500; }
        .tree-level { font-size: 10px; padding: 2px 6px; border-radius: 4px; }
        .tree-actions { display: none; gap: 4px; margin-left: 4px; }
        .tree-node-header:hover .tree-actions { display: flex; }
        .tree-btn { background: none; border: none; cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
        .tree-btn:hover { background: rgba(0,0,0,0.1); }
        .level-critical { background: rgba(255,59,48,0.1); color: #ff3b30; }
        .level-high { background: rgba(255,149,0,0.1); color: #ff9500; }
        .level-medium { background: rgba(255,204,0,0.1); color: #ff9500; }
        .level-low { background: rgba(40,200,64,0.1); color: #28c840; }
        .tree-children { margin-left: 20px; display: none; }
        .tree-children.expanded { display: block; }
        .add-btn { width: 100%; padding: 10px; background: #007aff; color: white; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; margin-top: 12px; }
        .add-btn:hover { background: #0071e3; }
        .btn { background: #007aff; color: white; border: none; padding: 8px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; }
        .btn:hover { background: #0071e3; }
        .btn-danger { background: #ff3b30; }
        .btn-danger:hover { background: #d63030; }
        /* Modal */
        .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 16px; padding: 24px; width: 400px; max-width: 90%; }
        .modal-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
        .form-group { margin-bottom: 12px; }
        .form-label { font-size: 12px; font-weight: 500; color: #86868b; margin-bottom: 4px; display: block; }
        .form-input { width: 100%; padding: 10px; border: 1px solid #e5e5e7; border-radius: 8px; font-size: 14px; }
        .form-select { width: 100%; padding: 10px; border: 1px solid #e5e5e7; border-radius: 8px; font-size: 14px; }
        .modal-btns { display: flex; gap: 8px; margin-top: 16px; }
        .modal-btn { flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .modal-btn.cancel { background: #f5f5f7; color: #1d1d1f; }
        .modal-btn.confirm { background: #007aff; color: white; }
        /* Content */
        .content { padding: 24px; overflow-y: auto; }
        .panel { background: white; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 20px; margin-bottom: 16px; }
        .panel-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        /* AI Panel */
        .ai-panel { background: #1e1e1e; border-left: 1px solid #3e3e42; display: flex; flex-direction: column; }
        .ai-header { background: #252526; padding: 12px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #3e3e42; }
        .ai-badge { font-size: 10px; background: rgba(0,122,255,0.3); color: #007aff; padding: 2px 6px; border-radius: 4px; }
        .ai-title { font-size: 14px; color: #ccc; }
        .ai-messages { flex: 1; overflow-y: auto; padding: 16px; }
        .ai-msg { margin-bottom: 16px; font-size: 13px; line-height: 1.5; }
        .ai-msg.user { text-align: right; }
        .ai-msg.user .msg-content { background: #007aff; color: white; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; text-align: left; }
        .ai-msg.assistant .msg-content { background: #2d2d30; color: #ccc; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; }
        .ai-input-area { background: #252526; padding: 12px; border-top: 1px solid #3e3e42; }
        .ai-input { width: 100%; background: #3c3c3c; border: 1px solid #4d4d4d; border-radius: 8px; padding: 10px 12px; color: #ccc; font-size: 13px; resize: none; font-family: inherit; }
        .ai-input:focus { outline: none; border-color: #007aff; }
        .ai-tools { display: flex; gap: 8px; margin-top: 8px; }
        .ai-tool { background: transparent; border: 1px solid #4d4d4d; color: #888; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .ai-tool:hover { background: rgba(255,255,255,0.05); color: #ccc; }
        .typing { display: flex; gap: 4px; padding: 8px 0; }
        .typing span { width: 8px; height: 8px; background: #007aff; border-radius: 50%; animation: bounce 1.4s infinite; }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 产品经理</h1>
        <nav class="nav">
            <a href="/">首页</a>
            <a href="/product" class="active">产品</a>
            <a href="/design">设计</a>
            <a href="/develop">开发</a>
            <a href="/test">测试</a>
            <a href="/operations">运营</a>
            <a href="/settings" class="settings">⚙️ 设置</a>
        </nav>
    </div>
    <div class="main">
        <div class="drawer">
            <div class="drawer-tabs">
                <div class="drawer-tab active" onclick="switchTab('requirements')">📄 需求</div>
                <div class="drawer-tab" onclick="switchTab('features')">🎯 功能</div>
            </div>
            <div class="drawer-content">
                <!-- Requirements Tab -->
                <div id="tab-requirements" class="tab-panel active">
                    <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                        <div class="upload-icon">📤</div>
                        <div class="upload-text">点击上传需求文档</div>
                    </div>
                    <input type="file" id="fileInput" style="display:none" multiple onchange="handleFileUpload(event)">
                    <div class="file-list" id="fileList">
                        <div class="file-item"><span class="file-icon">📄</span><div class="file-info"><div class="file-name">用户登录需求.docx</div><div class="file-meta">2024-01-15 · 2.3MB</div></div></div>
                        <div class="file-item"><span class="file-icon">📄</span><div class="file-info"><div class="file-name">首页原型评审.pdf</div><div class="file-meta">2024-01-14 · 5.1MB</div></div></div>
                    </div>
                </div>
                <!-- Features Tab -->
                <div id="tab-features" class="tab-panel">
                    <input type="text" class="form-input" id="featureSearch" placeholder="🔍 搜索功能..." style="margin-bottom:12px" oninput="renderFeatureTree()">
                    <div class="feature-tree" id="featureTree">
                        <div class="tree-empty" id="treeEmpty">暂无功能，点击下方按钮添加</div>
                        <div id="treeNodes"></div>
                    </div>
                    <button class="add-btn" onclick="showAddFeatureModal()">+ 添加功能</button>
                </div>
            </div>
        </div>
        <div class="content">
            <div class="panel">
                <div class="panel-title">📊 功能详情</div>
                <div id="featureDetail" style="color:#86868b;font-size:14px;">点击左侧功能树查看详情</div>
            </div>
        </div>
        <div class="ai-panel">
            <div class="ai-header">
                <span class="ai-badge">🤖</span>
                <span class="ai-title">产品经理 AI 助手</span>
            </div>
            <div class="ai-messages" id="aiMessages">
                <div class="ai-msg assistant">
                    <div class="msg-content">👋 你好！我是产品经理的AI助手。

我可以帮你：
• 分析需求文档
• 生成功能清单
• 评估开发工作量
• 编写PRD文档

有什么需要帮助的？</div>
                </div>
            </div>
            <div class="ai-input-area">
                <textarea class="ai-input" id="aiInput" rows="2" placeholder="输入你的问题..."></textarea>
                <div class="ai-tools">
                    <button class="ai-tool" onclick="sendAI('帮我分析这个需求的可行性')">📋 分析</button>
                    <button class="ai-tool" onclick="sendAI('生成功能清单')">📝 清单</button>
                    <button class="ai-tool" onclick="sendAI('评估工作量')">⏱️ 评估</button>
                    <button class="ai-tool" onclick="sendAI()" style="background:#007aff;color:white;border-color:#007aff">发送</button>
                </div>
            </div>
        </div>
    </div>
    <!-- Add Feature Modal -->
    <div class="modal" id="featureModal" style="display:none">
        <div class="modal-content">
            <div class="modal-title" id="modalTitle">添加功能</div>
            <div class="form-group">
                <label class="form-label">功能名称</label>
                <input type="text" class="form-input" id="featureName" placeholder="如：用户登录">
            </div>
            <div class="form-group">
                <label class="form-label">优先级</label>
                <select class="form-select" id="featureLevel">
                    <option value="critical">🔴 紧急 (Critical)</option>
                    <option value="high">🟠 高 (High)</option>
                    <option value="medium" selected>🟡 中 (Medium)</option>
                    <option value="low">🟢 低 (Low)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">描述</label>
                <textarea class="form-input" id="featureDesc" rows="3" placeholder="功能描述..."></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">上级功能 (留空为顶级)</label>
                <select class="form-select" id="featureParent">
                    <option value="">-- 无上级 --</option>
                </select>
            </div>
            <div class="modal-btns">
                <button class="modal-btn cancel" onclick="closeModal()">取消</button>
                <button class="modal-btn confirm" onclick="saveFeature()">保存</button>
            </div>
        </div>
    </div>
    <script>
        let sessionId = 'product_' + Date.now();
        let selectedFeature = null;
        let editingFeature = null;
        let expandedNodes = new Set();
        let features = [];

        // --- API-based persistence ---
        function loadFeatures() {
            fetch('/api/features')
                .then(r => r.json())
                .then(data => {
                    if (data.features) {
                        features = data.features;
                        renderFeatureTree();
                        updateFeatureCount();
                    }
                })
                .catch(() => { features = []; renderFeatureTree(); });
        }

        function updateFeatureCount() {
            const count = document.getElementById('featureCount');
            if (count) count.textContent = features.length;
        }

        // --- XSS escape ---
        function esc(str) {
            const d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        }

        function switchTab(tab) {
            document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            if (tab === 'requirements') {
                document.querySelector('.drawer-tab:nth-child(1)').classList.add('active');
                document.getElementById('tab-requirements').classList.add('active');
            } else {
                document.querySelector('.drawer-tab:nth-child(2)').classList.add('active');
                document.getElementById('tab-features').classList.add('active');
            }
        }

        function handleFileUpload(event) {
            const files = event.target.files;
            const list = document.getElementById('fileList');
            for (let f of files) {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.innerHTML = '<span class="file-icon">📄</span><div class="file-info"><div class="file-name">' + esc(f.name) + '</div><div class="file-meta">' + new Date().toLocaleDateString() + ' · ' + (f.size/1024).toFixed(1) + 'KB</div></div>';
                list.appendChild(item);
            }
        }

        // --- Feature Tree ---
        function getRootNodes(allFeatures) {
            return allFeatures.filter(f => !f.parent || !allFeatures.find(p => p.id === f.parent));
        }

        function getChildren(nodeId, allFeatures) {
            return allFeatures.filter(f => f.parent === nodeId);
        }

        function getDescendants(id) {
            const ids = new Set();
            const queue = [id];
            while (queue.length) {
                const cur = queue.shift();
                features.filter(f => f.parent === cur && !ids.has(f.id)).forEach(f => {
                    ids.add(f.id);
                    queue.push(f.id);
                });
            }
            return ids;
        }

        function renderFeatureTree() {
            const container = document.getElementById('treeNodes');
            const empty = document.getElementById('treeEmpty');
            const searchText = document.getElementById('featureSearch')?.value?.toLowerCase() || '';

            let displayFeatures = features;
            if (searchText) {
                // Find matching features + all their ancestors to keep tree structure
                const matchIds = new Set();
                features.forEach(f => {
                    if (f.name.toLowerCase().includes(searchText) || f.desc.toLowerCase().includes(searchText)) {
                        matchIds.add(f.id);
                        // Add all ancestors
                        let cur = f;
                        while (cur && cur.parent) {
                            matchIds.add(cur.parent);
                            cur = features.find(p => p.id === cur.parent);
                        }
                    }
                });
                displayFeatures = features.filter(f => matchIds.has(f.id));
                // Auto-expand ancestors of search results
                matchIds.forEach(id => expandedNodes.add(id));
            }

            if (displayFeatures.length === 0) {
                empty.style.display = 'block';
                container.innerHTML = '';
                return;
            }
            empty.style.display = 'none';

            const rootNodes = getRootNodes(displayFeatures);
            container.innerHTML = renderNodes(rootNodes, displayFeatures, 0);
        }

        function renderNodes(nodes, allFeatures, level) {
            return nodes.map(node => {
                const children = getChildren(node.id, allFeatures);
                const hasChildren = children.length > 0;
                const isExpanded = expandedNodes.has(node.id);
                const levelClass = 'level-' + node.level;
                const indent = level * 16;
                return '<div class="tree-node">' +
                    '<div class="tree-node-header' + (selectedFeature === node.id ? ' selected' : '') + '" style="padding-left:' + (8 + indent) + 'px" onclick="selectFeature(\'' + node.id + '\')" ondblclick="editFeature(\'' + node.id + '\')">' +
                    '<span class="tree-toggle" onclick="event.stopPropagation();toggleNode(\'' + node.id + '\')">' + (hasChildren ? (isExpanded ? '▼' : '▶') : '') + '</span>' +
                    '<span class="tree-icon">' + (hasChildren ? '📁' : '📄') + '</span>' +
                    '<span class="tree-label">' + esc(node.name) + '</span>' +
                    '<span class="tree-level ' + levelClass + '">' + esc(node.levelText) + '</span>' +
                    '<span class="tree-actions" onclick="event.stopPropagation()">' +
                    '<button class="tree-btn" onclick="showAddFeatureModal(\'' + node.id + '\')" title="添加子功能">➕</button>' +
                    '<button class="tree-btn" onclick="editFeature(\'' + node.id + '\')" title="编辑">✏️</button>' +
                    '<button class="tree-btn" onclick="deleteFeature(\'' + node.id + '\')" title="删除">🗑️</button>' +
                    '</span>' +
                    '</div>' +
                    (hasChildren ? '<div class="tree-children' + (isExpanded ? ' expanded' : '') + '">' + renderNodes(children, allFeatures, level + 1) + '</div>' : '') +
                    '</div>';
            }).join('');
        }

        function toggleNode(id) {
            if (expandedNodes.has(id)) {
                expandedNodes.delete(id);
            } else {
                expandedNodes.add(id);
            }
            renderFeatureTree();
        }

        function selectFeature(id) {
            selectedFeature = id;
            renderDetail();
            renderFeatureTree();
        }

        function renderDetail() {
            const detail = document.getElementById('featureDetail');
            if (!selectedFeature) {
                detail.innerHTML = '<div style="color:#86868b;font-size:14px">点击左侧功能查看详情</div>';
                return;
            }
            const feature = features.find(f => f.id === selectedFeature);
            if (!feature) {
                selectedFeature = null;
                detail.innerHTML = '<div style="color:#86868b;font-size:14px">点击左侧功能查看详情</div>';
                return;
            }
            const parent = feature.parent ? features.find(f => f.id === feature.parent) : null;
            const children = getChildren(feature.id, features);
            detail.innerHTML =
                '<b style="font-size:16px">' + esc(feature.name) + '</b><br><br>' +
                '<div style="margin-bottom:8px"><b style="color:#86868b">优先级：</b><span class="tree-level level-' + feature.level + '">' + esc(feature.levelText) + '</span></div>' +
                '<div style="margin-bottom:8px"><b style="color:#86868b">上级：</b>' + (parent ? esc(parent.name) : '无') + '</div>' +
                '<div style="margin-bottom:8px"><b style="color:#86868b">子功能：</b>' + (children.length > 0 ? children.map(c => esc(c.name)).join('、') : '无') + '</div>' +
                '<div style="margin-bottom:12px"><b style="color:#86868b">描述：</b><br>' + (feature.desc ? esc(feature.desc) : '无') + '</div>' +
                '<div style="margin-top:16px">' +
                '<button class="btn" onclick="editFeature(\'' + feature.id + '\')" style="margin-right:8px">✏️ 编辑</button>' +
                '<button class="btn" onclick="deleteFeature(\'' + feature.id + '\')" style="background:#ff3b30">🗑️ 删除</button>' +
                '</div>';
        }

        function editFeature(id) {
            editingFeature = id;
            const feature = features.find(f => f.id === id);
            if (!feature) return;
            document.getElementById('modalTitle').textContent = '编辑功能';
            document.getElementById('featureName').value = feature.name;
            document.getElementById('featureLevel').value = feature.level;
            document.getElementById('featureDesc').value = feature.desc;
            populateParentSelect(feature.parent || '', feature.id);
            document.getElementById('featureModal').style.display = 'flex';
        }

        function populateParentSelect(selectedId, excludeId) {
            const select = document.getElementById('featureParent');
            // Exclude the feature being edited AND all its descendants to prevent cycles
            const excludeIds = new Set();
            if (excludeId) {
                excludeIds.add(excludeId);
                getDescendants(excludeId).forEach(id => excludeIds.add(id));
            }
            const options = features.filter(f => !excludeIds.has(f.id)).map(f => {
                const indent = getAncestors(f.id).length;
                const prefix = '\u3000'.repeat(indent);
                return '<option value="' + f.id + '"' + (f.id === selectedId ? ' selected' : '') + '>' + prefix + esc(f.name) + '</option>';
            });
            select.innerHTML = '<option value="">-- 无上级 --</option>' + options.join('');
        }

        function getAncestors(id) {
            const ancestors = [];
            let current = features.find(f => f.id === id);
            while (current && current.parent) {
                ancestors.push(current.parent);
                current = features.find(f => f.id === current.parent);
            }
            return ancestors;
        }

        function showAddFeatureModal(parentId) {
            editingFeature = null;
            document.getElementById('modalTitle').textContent = '添加功能';
            document.getElementById('featureName').value = '';
            document.getElementById('featureLevel').value = 'medium';
            document.getElementById('featureDesc').value = '';
            populateParentSelect(parentId || '');
            if (parentId) {
                document.getElementById('featureParent').value = parentId;
            }
            document.getElementById('featureModal').style.display = 'flex';
        }

        function closeModal() {
            document.getElementById('featureModal').style.display = 'none';
        }

        function saveFeature() {
            const name = document.getElementById('featureName').value.trim();
            const level = document.getElementById('featureLevel').value;
            const desc = document.getElementById('featureDesc').value.trim();
            const parent = document.getElementById('featureParent').value || null;

            if (!name) { alert('请输入功能名称'); return; }

            if (editingFeature) {
                // Update existing
                fetch('/api/features/' + editingFeature, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name, level, desc, parent})
                }).then(r => r.json()).then(updated => {
                    const idx = features.findIndex(f => f.id === editingFeature);
                    if (idx !== -1) features[idx] = updated;
                    closeModal();
                    renderFeatureTree();
                    if (selectedFeature === editingFeature) renderDetail();
                }).catch(err => alert('保存失败: ' + err));
            } else {
                // Create new
                fetch('/api/features', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({name, level, desc, parent})
                }).then(r => r.json()).then(created => {
                    features.push(created);
                    closeModal();
                    renderFeatureTree();
                    updateFeatureCount();
                }).catch(err => alert('创建失败: ' + err));
            }
        }

        function deleteFeature(id) {
            const descCount = getDescendants(id).size;
            const msg = descCount > 0
                ? '确定删除此功能及其 ' + descCount + ' 个子功能？'
                : '确定删除此功能？';
            if (!confirm(msg)) return;

            fetch('/api/features/' + id, {method: 'DELETE'})
                .then(() => {
                    const deleteIds = new Set([id]);
                    getDescendants(id).forEach(did => deleteIds.add(did));
                    features = features.filter(f => !deleteIds.has(f.id));
                    if (deleteIds.has(selectedFeature)) {
                        selectedFeature = null;
                    }
                    renderDetail();
                    renderFeatureTree();
                    updateFeatureCount();
                })
                .catch(err => alert('删除失败: ' + err));
        }

        // --- Modal keyboard support ---
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeModal();
        });

        function sendAI(template) {
            const input = document.getElementById('aiInput');
            const msg = template || input.value.trim();
            if (!msg) return;
            input.value = '';
            addMessage(msg, 'user');
            addTyping();
            fetch('/api/ai/stream?session=' + sessionId, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_id: sessionId, role: 'product', content: msg})
            }).then(r => r.text()).then(text => {
                document.querySelector('.typing')?.remove();
                addMessage(text, 'assistant');
            });
        }
        function addMessage(content, role) {
            const div = document.createElement('div');
            div.className = 'ai-msg ' + role;
            div.innerHTML = '<div class="msg-content">' + content.replace(/\n/g, '<br>') + '</div>';
            document.getElementById('aiMessages').appendChild(div);
            div.scrollIntoView();
        }
        function addTyping() {
            const div = document.createElement('div');
            div.className = 'ai-msg assistant';
            div.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
            document.getElementById('aiMessages').appendChild(div);
        }
        document.getElementById('aiInput').addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
        });
        loadFeatures();
    </script>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (s *Server) handleDesignView(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow - UI设计</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f7; color: #1d1d1f; height: 100vh; overflow: hidden; }
        .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 20px; }
        .nav { display: flex; gap: 8px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; opacity: 0.7; }
        .nav a:hover, .nav a.active { opacity: 1; background: rgba(255,255,255,0.1); }
        .main { display: grid; grid-template-columns: 220px 1fr 280px 380px; height: calc(100vh - 60px); }
        .sidebar { background: white; padding: 16px; overflow-y: auto; border-right: 1px solid #e5e5e7; }
        .sidebar-title { font-size: 12px; color: #86868b; text-transform: uppercase; margin-bottom: 12px; }
        .comp-item { display: flex; align-items: center; gap: 8px; padding: 8px; background: #f5f5f7; border-radius: 6px; margin-bottom: 6px; cursor: pointer; font-size: 13px; }
        .comp-item:hover { background: #e8e8ed; }
        .canvas { background: #f0f0f0; display: flex; align-items: center; justify-content: center; border-right: 1px solid #e5e5e7; color: #86868b; }
        .props { background: white; padding: 16px; overflow-y: auto; border-right: 1px solid #e5e5e7; }
        .prop-group { margin-bottom: 16px; }
        .prop-label { font-size: 11px; color: #86868b; text-transform: uppercase; margin-bottom: 4px; }
        .prop-input { width: 100%; padding: 8px; border: 1px solid #e5e5e7; border-radius: 6px; font-size: 13px; }
        .ai-panel { background: #1e1e1e; display: flex; flex-direction: column; }
        .ai-header { background: #252526; padding: 12px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #3e3e42; }
        .ai-badge { font-size: 10px; background: rgba(0,122,255,0.3); color: #007aff; padding: 2px 6px; border-radius: 4px; }
        .ai-title { font-size: 14px; color: #ccc; }
        .ai-messages { flex: 1; overflow-y: auto; padding: 16px; }
        .ai-msg { margin-bottom: 16px; font-size: 13px; line-height: 1.5; }
        .ai-msg.user { text-align: right; }
        .ai-msg.user .msg-content { background: #007aff; color: white; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; text-align: left; }
        .ai-msg.assistant .msg-content { background: #2d2d30; color: #ccc; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; }
        .ai-input-area { background: #252526; padding: 12px; border-top: 1px solid #3e3e42; }
        .ai-input { width: 100%; background: #3c3c3c; border: 1px solid #4d4d4d; border-radius: 8px; padding: 10px 12px; color: #ccc; font-size: 13px; resize: none; }
        .ai-input:focus { outline: none; border-color: #007aff; }
        .ai-tools { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .ai-tool { background: transparent; border: 1px solid #4d4d4d; color: #888; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; }
        .ai-tool:hover { background: rgba(255,255,255,0.05); color: #ccc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎨 UI 设计</h1>
        <nav class="nav">
            <a href="/">首页</a><a href="/product">产品</a><a href="/design" class="active">设计</a><a href="/develop">开发</a><a href="/test">测试</a><a href="/operations">运营</a>
            <a href="/settings" class="settings">⚙️ 设置</a>
        </nav>
    </div>
    <div class="main">
        <div class="sidebar">
            <div class="sidebar-title">📦 组件库</div>
            <div class="comp-item">📝 按钮</div>
            <div class="comp-item">📄 输入框</div>
            <div class="comp-item">☑️ 复选框</div>
            <div class="comp-item">🔽 下拉菜单</div>
            <div class="comp-item">📋 卡片</div>
            <div class="comp-item">🗂️ 列表</div>
            <div class="comp-item">🖼️ 图片</div>
            <div class="comp-item">📊 表格</div>
        </div>
        <div class="canvas">拖拽组件到此处开始设计</div>
        <div class="props">
            <div class="sidebar-title">⚙️ 属性</div>
            <div class="prop-group">
                <div class="prop-label">名称</div>
                <input class="prop-input" placeholder="组件名称">
            </div>
            <div class="prop-group">
                <div class="prop-label">宽度</div>
                <input class="prop-input" type="number" value="100">
            </div>
            <div class="prop-group">
                <div class="prop-label">高度</div>
                <input class="prop-input" type="number" value="40">
            </div>
            <div class="prop-group">
                <div class="prop-label">背景色</div>
                <input class="prop-input" value="#007AFF">
            </div>
        </div>
        <div class="ai-panel">
            <div class="ai-header">
                <span class="ai-badge">🤖</span>
                <span class="ai-title">设计 AI 助手</span>
            </div>
            <div class="ai-messages" id="aiMessages">
                <div class="ai-msg assistant">
                    <div class="msg-content">👋 你好！我是UI设计的AI助手。

我可以帮你：
• 推荐合适的组件
• 提供布局建议
• 生成配色方案
• 优化用户体验

选择或拖拽组件，我可以给你具体建议！</div>
                </div>
            </div>
            <div class="ai-input-area">
                <textarea class="ai-input" id="aiInput" rows="2" placeholder="描述你的设计需求..."></textarea>
                <div class="ai-tools">
                    <button class="ai-tool" onclick="sendAI('推荐一个登录页面的布局')">📐 布局</button>
                    <button class="ai-tool" onclick="sendAI('推荐配色方案')">🎨 配色</button>
                    <button class="ai-tool" onclick="sendAI('分析用户体验')">👁️ UX</button>
                    <button class="ai-tool" onclick="sendAI('生成组件代码')">💻 代码</button>
                </div>
            </div>
        </div>
    </div>
    <script>
        let sessionId = 'design_' + Date.now();
        function sendAI(template) {
            const input = document.getElementById('aiInput');
            const msg = template || input.value.trim();
            if (!msg) return;
            input.value = '';
            addMessage(msg, 'user');
            fetch('/api/ai/stream?session=' + sessionId, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_id: sessionId, role: 'design', content: msg})
            }).then(r => r.text()).then(text => {
                addMessage(text, 'assistant');
            });
        }
        function addMessage(content, role) {
            const div = document.createElement('div');
            div.className = 'ai-msg ' + role;
            div.innerHTML = '<div class="msg-content">' + content.replace(/\n/g, '<br>') + '</div>';
            document.getElementById('aiMessages').appendChild(div);
            div.scrollIntoView();
        }
        document.getElementById('aiInput').addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
        });
    </script>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (s *Server) handleDevelopView(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow - 开发 (OpenCode)</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Monaco, Menlo, monospace; background: #1e1e1e; color: #ccc; height: 100vh; overflow: hidden; }
        .header { background: #323233; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 14px; }
        .nav { display: flex; gap: 6px; }
        .nav a { color: #ccc; text-decoration: none; padding: 6px 10px; border-radius: 4px; font-size: 12px; opacity: 0.7; }
        .nav a:hover, .nav a.active { opacity: 1; background: rgba(255,255,255,0.1); }
        .main { display: grid; grid-template-columns: 48px 200px 1fr 320px; height: calc(100vh - 44px); }
        .activity { background: #333; padding: 12px 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .activity-item { font-size: 20px; cursor: pointer; padding: 8px; border-radius: 6px; }
        .activity-item:hover { background: rgba(255,255,255,0.1); }
        .activity-item.active { color: #007aff; }
        .sidebar { background: #252526; border-right: 1px solid #3e3e42; overflow-y: auto; }
        .sidebar-section { padding: 12px 0; border-bottom: 1px solid #3e3e42; }
        .sidebar-title { font-size: 10px; text-transform: uppercase; color: #6e6e6e; padding: 0 12px; margin-bottom: 8px; }
        .file-item { padding: 4px 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .file-item:hover { background: rgba(255,255,255,0.05); }
        .file-item.folder { color: #5191d8; }
        .editor { background: #1e1e1e; display: flex; flex-direction: column; }
        .editor-tabs { background: #323233; display: flex; }
        .editor-tab { padding: 8px 16px; font-size: 12px; color: #888; border-bottom: 2px solid transparent; cursor: pointer; }
        .editor-tab.active { color: #ccc; border-bottom-color: #007aff; }
        .editor-content { flex: 1; padding: 16px; font-size: 13px; line-height: 1.6; overflow: auto; }
        .line-num { color: #858585; margin-right: 16px; text-align: right; display: inline-block; width: 32px; }
        .code-line { display: block; }
        .ai-panel { background: #252526; border-left: 1px solid #3e3e42; display: flex; flex-direction: column; }
        .ai-header { background: #323233; padding: 10px 14px; display: flex; align-items: center; gap: 8px; }
        .ai-badge { font-size: 9px; background: rgba(0,122,255,0.3); color: #007aff; padding: 2px 5px; border-radius: 3px; }
        .ai-title { font-size: 12px; color: #ccc; }
        .ai-model { font-size: 10px; color: #888; margin-left: auto; }
        .ai-messages { flex: 1; overflow-y: auto; padding: 12px; }
        .ai-msg { margin-bottom: 12px; font-size: 12px; line-height: 1.5; }
        .ai-msg.user { text-align: right; }
        .ai-msg.user .msg-content { background: #007aff; color: white; padding: 8px 12px; border-radius: 10px; display: inline-block; max-width: 85%; text-align: left; font-size: 12px; }
        .ai-msg.assistant .msg-content { background: #2d2d30; color: #ccc; padding: 8px 12px; border-radius: 10px; display: inline-block; max-width: 85%; font-size: 12px; }
        .ai-msg.tool .msg-content { background: #1d1d1f; color: #a78bfa; padding: 6px 10px; border-radius: 6px; font-size: 11px; border: 1px solid #3d3d3d; }
        .ai-input-area { background: #323233; padding: 10px; border-top: 1px solid #3e3e42; }
        .ai-input { width: 100%; background: #3c3c3c; border: 1px solid #4d4d4d; border-radius: 6px; padding: 8px 10px; color: #ccc; font-size: 12px; resize: none; font-family: inherit; }
        .ai-input:focus { outline: none; border-color: #007aff; }
        .ai-tools { display: flex; gap: 6px; margin-top: 8px; }
        .ai-tool { background: transparent; border: 1px solid #4d4d4d; color: #888; padding: 5px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; }
        .ai-tool:hover { background: rgba(255,255,255,0.05); color: #ccc; }
        .ai-tool.primary { background: #007aff; color: white; border-color: #007aff; }
        .ai-tool.primary:hover { background: #0071e3; }
    </style>
</head>
<body>
    <div class="header">
        <h1>💻 DevFlow - OpenCode 开发环境</h1>
        <nav class="nav">
            <a href="/">首页</a><a href="/product">产品</a><a href="/design">设计</a><a href="/develop" class="active">开发</a><a href="/test">测试</a><a href="/operations">运营</a>
            <a href="/settings" class="settings">⚙️ 设置</a>
        </nav>
    </div>
    <div class="main">
        <div class="activity">
            <div class="activity-item active" title="文件">📁</div>
            <div class="activity-item" title="搜索">🔍</div>
            <div class="activity-item" title="Git">📊</div>
            <div class="activity-item" title="AI">🤖</div>
        </div>
        <div class="sidebar">
            <div class="sidebar-section">
                <div class="sidebar-title">Explorer</div>
                <div class="file-item folder">📁 src/</div>
                <div class="file-item folder" style="padding-left:16px">📁 components/</div>
                <div class="file-item folder" style="padding-left:16px">📁 internal/</div>
                <div class="file-item folder" style="padding-left:16px">📁 cmd/</div>
                <div class="file-item" style="padding-left:32px">📄 main.go</div>
                <div class="file-item">📄 go.mod</div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-title">OpenCode 工具</div>
                <div class="file-item" style="font-size:11px">🔧 view, write, edit</div>
                <div class="file-item" style="font-size:11px">🔧 grep, glob, ls</div>
                <div class="file-item" style="font-size:11px">🔧 bash, shell</div>
            </div>
        </div>
        <div class="editor">
            <div class="editor-tabs">
                <div class="editor-tab active">main.go</div>
                <div class="editor-tab">agent.go</div>
                <div class="editor-tab">tools.go</div>
            </div>
            <div class="editor-content">
                <span class="code-line"><span class="line-num">1</span><span style="color:#c586c0">package</span> main</span>
                <span class="code-line"><span class="line-num">2</span></span>
                <span class="code-line"><span class="line-num">3</span><span style="color:#c586c0">import</span> (</span>
                <span class="code-line"><span class="line-num">4</span>    <span style="color:#569cd6">"context"</span></span>
                <span class="code-line"><span class="line-num">5</span>    <span style="color:#569cd6">"fmt"</span></span>
                <span class="code-line"><span class="line-num">6</span>    <span style="color:#569cd6">"net/http"</span></span>
                <span class="code-line"><span class="line-num">7</span>)</span>
                <span class="code-line"><span class="line-num">8</span></span>
                <span class="code-line"><span class="line-num">9</span><span style="color:#c586c0">func</span> <span style="color:#dcdcaa">main</span>() {</span>
                <span class="code-line"><span class="line-num">10</span>    <span style="color:#6a9955">// DevFlow - 基于 OpenCode</span></span>
                <span class="code-line"><span class="line-num">11</span>    fmt.<span style="color:#dcdcaa">Println</span>(<span style="color:#569cd6">"🚀 DevFlow 启动中..."</span>)</span>
                <span class="code-line"><span class="line-num">12</span>    http.<span style="color:#dcdcaa">ListenAndServe</span>(<span style="color:#569cd6">":8080"</span>, nil)</span>
                <span class="code-line"><span class="line-num">13</span>}</span>
            </div>
        </div>
        <div class="ai-panel">
            <div class="ai-header">
                <span class="ai-badge">🤖</span>
                <span class="ai-title">OpenCode AI</span>
                <span class="ai-model">Claude</span>
            </div>
            <div class="ai-messages" id="aiMessages">
                <div class="ai-msg assistant">
                    <div class="msg-content">🤖 OpenCode AI Coding Assistant 已就绪！

我可以帮你：
• 编写和编辑代码
• 使用工具 (view, write, edit, grep, glob, bash)
• 搜索和导航代码库
• 执行终端命令
• 解释代码逻辑

输入你的请求开始编程！</div>
                </div>
            </div>
            <div class="ai-input-area">
                <textarea class="ai-input" id="aiInput" rows="3" placeholder="输入代码请求，或使用工具命令..."></textarea>
                <div class="ai-tools">
                    <button class="ai-tool" onclick="sendAI('查看 main.go 的内容')">👁️ view</button>
                    <button class="ai-tool" onclick="sendAI('帮我写一个 HTTP 服务器')">📝 write</button>
                    <button class="ai-tool" onclick="sendAI('搜索 error 处理')">🔍 grep</button>
                    <button class="ai-tool" onclick="sendAI('运行 go build')">⚡ bash</button>
                    <button class="ai-tool primary" onclick="sendAI()">▶️ 发送</button>
                </div>
            </div>
        </div>
    </div>
    <script>
        let sessionId = 'develop_' + Date.now();
        function sendAI(template) {
            const input = document.getElementById('aiInput');
            const msg = template || input.value.trim();
            if (!msg) return;
            input.value = '';
            addMessage(msg, 'user');
            fetch('/api/ai/stream?session=' + sessionId, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_id: sessionId, role: 'develop', content: msg})
            }).then(r => r.text()).then(text => {
                addMessage(text, 'assistant');
            });
        }
        function addMessage(content, role) {
            const div = document.createElement('div');
            div.className = 'ai-msg ' + role;
            div.innerHTML = '<div class="msg-content">' + content.replace(/\n/g, '<br>') + '</div>';
            document.getElementById('aiMessages').appendChild(div);
            div.scrollIntoView();
        }
        document.getElementById('aiInput').addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
        });
    </script>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (s *Server) handleTestView(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow - 测试</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; color: #1d1d1f; height: 100vh; overflow: hidden; }
        .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 20px; }
        .nav { display: flex; gap: 8px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; opacity: 0.7; }
        .nav a:hover, .nav a.active { opacity: 1; background: rgba(255,255,255,0.1); }
        .main { display: grid; grid-template-columns: 1fr 380px; height: calc(100vh - 60px); }
        .content { padding: 20px; overflow-y: auto; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        .stat { background: white; border-radius: 12px; padding: 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .stat-num { font-size: 28px; font-weight: 700; }
        .stat-label { font-size: 11px; color: #86868b; margin-top: 4px; }
        .stat.success .stat-num { color: #28c840; }
        .stat.danger .stat-num { color: #ff3b30; }
        .stat.info .stat-num { color: #007aff; }
        .panel { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .panel-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
        .case-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f5f7; border-radius: 8px; margin-bottom: 6px; }
        .case-status { width: 10px; height: 10px; border-radius: 50%; }
        .case-status.passed { background: #28c840; }
        .case-status.failed { background: #ff3b30; }
        .case-status.pending { background: #ff9500; }
        .case-info { flex: 1; }
        .case-name { font-size: 13px; font-weight: 500; }
        .case-module { font-size: 11px; color: #86868b; }
        .case-time { font-size: 10px; color: #86868b; }
        .btn { background: #007aff; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .btn:hover { background: #0071e3; }
        /* AI Panel */
        .ai-panel { background: #1e1e1e; border-left: 1px solid #3e3e42; display: flex; flex-direction: column; }
        .ai-header { background: #252526; padding: 12px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #3e3e42; }
        .ai-badge { font-size: 10px; background: rgba(0,122,255,0.3); color: #007aff; padding: 2px 6px; border-radius: 4px; }
        .ai-title { font-size: 14px; color: #ccc; }
        .ai-messages { flex: 1; overflow-y: auto; padding: 16px; }
        .ai-msg { margin-bottom: 16px; font-size: 13px; line-height: 1.5; }
        .ai-msg.user { text-align: right; }
        .ai-msg.user .msg-content { background: #007aff; color: white; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; text-align: left; }
        .ai-msg.assistant .msg-content { background: #2d2d30; color: #ccc; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; }
        .ai-input-area { background: #252526; padding: 12px; border-top: 1px solid #3e3e42; }
        .ai-input { width: 100%; background: #3c3c3c; border: 1px solid #4d4d4d; border-radius: 8px; padding: 10px 12px; color: #ccc; font-size: 13px; resize: none; }
        .ai-input:focus { outline: none; border-color: #007aff; }
        .ai-tools { display: flex; gap: 8px; margin-top: 8px; }
        .ai-tool { background: transparent; border: 1px solid #4d4d4d; color: #888; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .ai-tool:hover { background: rgba(255,255,255,0.05); color: #ccc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 测试</h1>
        <nav class="nav">
            <a href="/">首页</a><a href="/product">产品</a><a href="/design">设计</a><a href="/develop">开发</a><a href="/test" class="active">测试</a><a href="/operations">运营</a>
            <a href="/settings" class="settings">⚙️ 设置</a>
        </nav>
    </div>
    <div class="main">
        <div class="content">
            <div class="stats">
                <div class="stat"><div class="stat-num">24</div><div class="stat-label">总用例</div></div>
                <div class="stat success"><div class="stat-num">18</div><div class="stat-label">通过</div></div>
                <div class="stat danger"><div class="stat-num">4</div><div class="stat-label">失败</div></div>
                <div class="stat info"><div class="stat-num">2</div><div class="stat-label">未执行</div></div>
            </div>
            <div class="panel">
                <div class="panel-title">📋 测试用例</div>
                <div class="case-item"><span class="case-status passed"></span><div class="case-info"><div class="case-name">用户登录 - 正常登录</div><div class="case-module">用户管理</div></div><span class="case-time">01-15</span></div>
                <div class="case-item"><span class="case-status passed"></span><div class="case-info"><div class="case-name">用户登录 - 密码错误</div><div class="case-module">用户管理</div></div><span class="case-time">01-15</span></div>
                <div class="case-item"><span class="case-status failed"></span><div class="case-info"><div class="case-name">用户注册 - 邮箱格式错误</div><div class="case-module">用户管理</div></div><span class="case-time">01-15</span></div>
                <div class="case-item"><span class="case-status pending"></span><div class="case-info"><div class="case-name">文章发布 - 上传图片</div><div class="case-module">内容管理</div></div><span class="case-time">01-14</span></div>
            </div>
            <div class="panel">
                <div class="panel-title">🐛 Bug 追踪</div>
                <div class="case-item"><span class="case-status failed"></span><div class="case-info"><div class="case-name">登录页面样式错位</div><div class="case-module">UI Bug · 高</div></div></div>
                <div class="case-item"><span class="case-status pending"></span><div class="case-info"><div class="case-name">API 响应超时</div><div class="case-module">后端 Bug · 中</div></div></div>
            </div>
        </div>
        <div class="ai-panel">
            <div class="ai-header">
                <span class="ai-badge">🤖</span>
                <span class="ai-title">测试 AI 助手</span>
            </div>
            <div class="ai-messages" id="aiMessages">
                <div class="ai-msg assistant">
                    <div class="msg-content">👋 你好！我是测试的AI助手。

我可以帮你：
• 生成测试用例
• 分析Bug原因
• 提供修复建议
• 编写测试报告

粘贴Bug信息，我可以帮你分析！</div>
                </div>
            </div>
            <div class="ai-input-area">
                <textarea class="ai-input" id="aiInput" rows="2" placeholder="输入你的问题..."></textarea>
                <div class="ai-tools">
                    <button class="ai-tool" onclick="sendAI('生成测试用例')">📋 用例</button>
                    <button class="ai-tool" onclick="sendAI('分析这个Bug原因')">🔍 分析</button>
                    <button class="ai-tool" onclick="sendAI('生成测试报告')">📄 报告</button>
                    <button class="ai-tool" onclick="sendAI()" style="background:#007aff;color:white;border-color:#007aff">发送</button>
                </div>
            </div>
        </div>
    </div>
    <script>
        let sessionId = 'test_' + Date.now();
        function sendAI(template) {
            const input = document.getElementById('aiInput');
            const msg = template || input.value.trim();
            if (!msg) return;
            input.value = '';
            addMessage(msg, 'user');
            fetch('/api/ai/stream?session=' + sessionId, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_id: sessionId, role: 'test', content: msg})
            }).then(r => r.text()).then(text => { addMessage(text, 'assistant'); });
        }
        function addMessage(content, role) {
            const div = document.createElement('div');
            div.className = 'ai-msg ' + role;
            div.innerHTML = '<div class="msg-content">' + content.replace(/\n/g, '<br>') + '</div>';
            document.getElementById('aiMessages').appendChild(div);
            div.scrollIntoView();
        }
        document.getElementById('aiInput').addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
        });
    </script>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (s *Server) handleOperationsView(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow - 运营</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; color: #1d1d1f; height: 100vh; overflow: hidden; }
        .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 20px; }
        .nav { display: flex; gap: 8px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; opacity: 0.7; }
        .nav a:hover, .nav a.active { opacity: 1; background: rgba(255,255,255,0.1); }
        .main { display: grid; grid-template-columns: 1fr 380px; height: calc(100vh - 60px); }
        .content { padding: 20px; overflow-y: auto; }
        .target-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
        .target-card { background: white; border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .target-icon { font-size: 32px; }
        .target-info { flex: 1; }
        .target-name { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
        .target-desc { font-size: 11px; color: #86868b; }
        .target-status { font-size: 10px; padding: 3px 8px; border-radius: 4px; }
        .target-status.connected { background: rgba(40,200,64,0.1); color: #28c840; }
        .target-status.disconnected { background: rgba(255,149,0,0.1); color: #ff9500; }
        .btn { background: #007aff; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; margin-right: 8px; }
        .btn:hover { background: #0071e3; }
        .btn-success { background: #28c840; }
        .btn-success:hover { background: #26be3a; }
        .panel { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .panel-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
        .history-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: #f5f5f7; border-radius: 8px; margin-bottom: 8px; }
        .history-status { font-size: 10px; padding: 3px 8px; border-radius: 4px; }
        .history-status.success { background: rgba(40,200,64,0.1); color: #28c840; }
        .history-status.failed { background: rgba(255,59,48,0.1); color: #ff3b30; }
        .history-version { font-weight: 600; font-size: 13px; flex: 1; }
        .history-time { font-size: 11px; color: #86868b; }
        /* AI Panel */
        .ai-panel { background: #1e1e1e; border-left: 1px solid #3e3e42; display: flex; flex-direction: column; }
        .ai-header { background: #252526; padding: 12px 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #3e3e42; }
        .ai-badge { font-size: 10px; background: rgba(0,122,255,0.3); color: #007aff; padding: 2px 6px; border-radius: 4px; }
        .ai-title { font-size: 14px; color: #ccc; }
        .ai-messages { flex: 1; overflow-y: auto; padding: 16px; }
        .ai-msg { margin-bottom: 16px; font-size: 13px; line-height: 1.5; }
        .ai-msg.user { text-align: right; }
        .ai-msg.user .msg-content { background: #007aff; color: white; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; text-align: left; }
        .ai-msg.assistant .msg-content { background: #2d2d30; color: #ccc; padding: 10px 14px; border-radius: 12px; display: inline-block; max-width: 85%; }
        .ai-input-area { background: #252526; padding: 12px; border-top: 1px solid #3e3e42; }
        .ai-input { width: 100%; background: #3c3c3c; border: 1px solid #4d4d4d; border-radius: 8px; padding: 10px 12px; color: #ccc; font-size: 13px; resize: none; }
        .ai-input:focus { outline: none; border-color: #007aff; }
        .ai-tools { display: flex; gap: 8px; margin-top: 8px; }
        .ai-tool { background: transparent; border: 1px solid #4d4d4d; color: #888; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .ai-tool:hover { background: rgba(255,255,255,0.05); color: #ccc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 运营</h1>
        <nav class="nav">
            <a href="/">首页</a><a href="/product">产品</a><a href="/design">设计</a><a href="/develop">开发</a><a href="/test">测试</a><a href="/operations" class="active">运营</a>
        </nav>
    </div>
    <div class="main">
        <div class="content">
            <div style="margin-bottom:16px">
                <button class="btn">部署到预发</button>
                <button class="btn btn-success">部署到生产</button>
            </div>
            <div class="target-grid">
                <div class="target-card"><div class="target-icon">☁️</div><div class="target-info"><div class="target-name">Vercel</div><div class="target-desc">静态网站部署</div></div><span class="target-status connected">已连接</span></div>
                <div class="target-card"><div class="target-icon">🐳</div><div class="target-info"><div class="target-name">Docker</div><div class="target-desc">容器化部署</div></div><span class="target-status disconnected">未连接</span></div>
                <div class="target-card"><div class="target-icon">☸️</div><div class="target-info"><div class="target-name">Kubernetes</div><div class="target-desc">K8s 集群部署</div></div><span class="target-status disconnected">未连接</span></div>
                <div class="target-card"><div class="target-icon">🌊</div><div class="target-info"><div class="target-name">AWS</div><div class="target-desc">AWS 云服务</div></div><span class="target-status disconnected">未连接</span></div>
            </div>
            <div class="panel">
                <div class="panel-title">📜 部署历史</div>
                <div class="history-item"><span class="history-status success">成功</span><span class="history-version">v1.2.3</span><span class="history-time">01-15 14:30</span><span style="color:#86868b;font-size:11px">Vercel</span></div>
                <div class="history-item"><span class="history-status success">成功</span><span class="history-version">v1.2.2</span><span class="history-time">01-14 10:20</span><span style="color:#86868b;font-size:11px">Vercel</span></div>
                <div class="history-item"><span class="history-status failed">失败</span><span class="history-version">v1.2.1</span><span class="history-time">01-13 16:45</span><span style="color:#86868b;font-size:11px">Docker</span></div>
            </div>
        </div>
        <div class="ai-panel">
            <div class="ai-header">
                <span class="ai-badge">🤖</span>
                <span class="ai-title">运营 AI 助手</span>
            </div>
            <div class="ai-messages" id="aiMessages">
                <div class="ai-msg assistant">
                    <div class="msg-content">👋 你好！我是运营的AI助手。

我可以帮你：
• 推荐部署方案
• 优化构建流程
• 分析性能问题
• 制定监控策略

选择部署目标，我来给你建议！</div>
                </div>
            </div>
            <div class="ai-input-area">
                <textarea class="ai-input" id="aiInput" rows="2" placeholder="输入你的问题..."></textarea>
                <div class="ai-tools">
                    <button class="ai-tool" onclick="sendAI('推荐部署方案')">📦 方案</button>
                    <button class="ai-tool" onclick="sendAI('优化构建流程')">⚡ 优化</button>
                    <button class="ai-tool" onclick="sendAI('分析性能')">📊 性能</button>
                    <button class="ai-tool" onclick="sendAI()" style="background:#007aff;color:white;border-color:#007aff">发送</button>
                </div>
            </div>
        </div>
    </div>
    <script>
        let sessionId = 'ops_' + Date.now();
        function sendAI(template) {
            const input = document.getElementById('aiInput');
            const msg = template || input.value.trim();
            if (!msg) return;
            input.value = '';
            addMessage(msg, 'user');
            fetch('/api/ai/stream?session=' + sessionId, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_id: sessionId, role: 'operations', content: msg})
            }).then(r => r.text()).then(text => { addMessage(text, 'assistant'); });
        }
        function addMessage(content, role) {
            const div = document.createElement('div');
            div.className = 'ai-msg ' + role;
            div.innerHTML = '<div class="msg-content">' + content.replace(/\n/g, '<br>') + '</div>';
            document.getElementById('aiMessages').appendChild(div);
            div.scrollIntoView();
        }
        document.getElementById('aiInput').addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
        });
    </script>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (s *Server) handleSettingsView(w http.ResponseWriter, r *http.Request) {
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevFlow - 设置</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f7; color: #1d1d1f; min-height: 100vh; }
        .header { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 20px; font-weight: 600; }
        .nav { display: flex; gap: 8px; }
        .nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; opacity: 0.7; transition: all 0.2s; }
        .nav a:hover, .nav a.active { opacity: 1; background: rgba(255,255,255,0.1); }
        .container { max-width: 800px; margin: 40px auto; padding: 0 20px; }
        .card { background: white; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
        .card-title { font-size: 18px; font-weight: 600; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        .provider-item { display: flex; align-items: center; gap: 16px; padding: 16px; background: #f5f5f7; border-radius: 12px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s; border: 2px solid transparent; }
        .provider-item:hover { background: #e8e8ed; }
        .provider-item.default { border-color: #28c840; }
        .provider-icon { font-size: 32px; width: 48px; text-align: center; }
        .provider-info { flex: 1; }
        .provider-name { font-weight: 600; font-size: 16px; margin-bottom: 2px; }
        .provider-desc { font-size: 12px; color: #86868b; }
        .provider-status { font-size: 11px; padding: 3px 8px; border-radius: 4px; }
        .provider-status.configured { background: rgba(40,200,64,0.1); color: #28c840; }
        .provider-status.unconfigured { background: rgba(255,149,0,0.1); color: #ff9500; }
        .form-group { margin-bottom: 16px; }
        .form-label { font-size: 13px; font-weight: 500; color: #1d1d1f; margin-bottom: 6px; display: block; }
        .form-input { width: 100%; padding: 10px 12px; border: 1px solid #e5e5e7; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
        .form-input:focus { outline: none; border-color: #007aff; }
        .btn { background: #007aff; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; transition: background 0.2s; }
        .btn:hover { background: #0071e3; }
        .btn-save { width: 100%; margin-top: 12px; }
        .toast { position: fixed; bottom: 20px; right: 20px; background: #1e1e1e; color: white; padding: 12px 20px; border-radius: 8px; font-size: 14px; opacity: 0; transform: translateY(20px); transition: all 0.3s; }
        .toast.show { opacity: 1; transform: translateY(0); }
        .toast.success { background: #28c840; }
        .toast.error { background: #ff3b30; }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚙️ 设置</h1>
        <nav class="nav">
            <a href="/">首页</a>
            <a href="/settings" class="active">设置</a>
        </nav>
    </div>
    <div class="container">
        <div class="card">
            <div class="card-title">🤖 AI 提供商配置</div>
            <div id="providerList"></div>
        </div>
        <div class="card" id="configCard" style="display:none">
            <div class="card-title" id="configTitle">配置 Claude</div>
            <div class="form-group">
                <label class="form-label">API Key</label>
                <input type="password" class="form-input" id="apiKeyInput" placeholder="输入 API Key...">
            </div>
            <div class="form-group">
                <label class="form-label">自定义 Endpoint (可选)</label>
                <input type="text" class="form-input" id="endpointInput" placeholder="https://api.example.com/v1">
            </div>
            <div class="form-group">
                <label class="form-label">模型 (手动输入)</label>
                <input type="text" class="form-input" id="modelInput" placeholder="如: gpt-4o, claude-sonnet-4-20250514">
            </div>
            <button class="btn btn-save" onclick="saveConfig()">保存配置</button>
        </div>
        <div class="card">
            <div class="card-title">📋 默认 AI 提供商</div>
            <select class="form-input" id="defaultProvider" onchange="setDefaultProvider()"></select>
        </div>
    </div>
    <div class="toast" id="toast"></div>
    <script>
        let currentProvider = null;
        let providers = [];
        let models = {};
        let config = {};
        async function loadProviders() {
            const resp = await fetch('/api/config/providers');
            const data = await resp.json();
            providers = data.providers;
            models = data.models || {};
            const respCfg = await fetch('/api/config');
            config = await respCfg.json();
            renderProviders();
            renderDefaultOptions();
        }
        function renderProviders() {
            const list = document.getElementById('providerList');
            list.innerHTML = providers.map(p => {
                const cfg = config.providers[p.id] || {};
                const isConfigured = cfg.api_key && cfg.api_key !== '***';
                const isDefault = config.default === p.id;
                return '<div class="provider-item' + (isDefault ? ' default' : '') + '" onclick="selectProvider(\'' + p.id + '\')">' +
                    '<div class="provider-icon">' + (p.icon || '🔗') + '</div>' +
                    '<div class="provider-info"><div class="provider-name">' + p.name + '</div><div class="provider-desc">' + p.endpoint + '</div></div>' +
                    '<div><span class="provider-status ' + (isConfigured ? 'configured' : 'unconfigured') + '">' + (isConfigured ? '已配置' : '未配置') + '</span>' +
                    (isDefault ? '<span style="margin-left:8px;font-size:11px;color:#28c840">默认</span>' : '') + '</div></div>';
            }).join('');
        }
        function renderDefaultOptions() {
            const select = document.getElementById('defaultProvider');
            select.innerHTML = providers.map(p => '<option value="' + p.id + '">' + p.name + '</option>').join('');
            select.value = config.default || 'anthropic';
        }
        function selectProvider(id) {
            currentProvider = id;
            const cfg = config.providers[id] || {};
            const pInfo = providers.find(p => p.id === id) || {};
            document.getElementById('configCard').style.display = 'block';
            document.getElementById('configTitle').textContent = '配置 ' + (pInfo.name || id);
            document.getElementById('apiKeyInput').value = cfg.api_key || '';
            document.getElementById('endpointInput').placeholder = pInfo.endpoint || 'https://api.example.com/v1';
            document.getElementById('endpointInput').value = cfg.endpoint || '';
            document.getElementById('modelInput').value = cfg.model || pInfo.defaultModel || '';
        }
        function updateModelSelect(provider, currentModel) {
            const providerModels = models[provider] || [];
            const select = document.getElementById('modelSelect');
            if (providerModels.length > 0) {
                select.innerHTML = providerModels.map(m => '<option value="' + m + '">' + m + '</option>').join('');
                if (currentModel && providerModels.includes(currentModel)) {
                    select.value = currentModel;
                }
            } else {
                select.innerHTML = '<option value="">默认</option>';
            }
        }
        async function saveConfig() {
            const apiKey = document.getElementById('apiKeyInput').value;
            const endpoint = document.getElementById('endpointInput').value;
            const model = document.getElementById('modelInput').value;
            const resp = await fetch('/api/config/provider', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:currentProvider,api_key:apiKey,endpoint:endpoint,model:model})});
            if (resp.ok) { showToast('配置已保存', 'success'); loadProviders(); } else { showToast('保存失败', 'error'); }
        }
        async function setDefaultProvider() {
            const resp = await fetch('/api/config/default', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:document.getElementById('defaultProvider').value})});
            if (resp.ok) { showToast('默认提供商已设置', 'success'); loadProviders(); }
        }
        function showToast(msg, type) { const toast = document.getElementById('toast'); toast.textContent = msg; toast.className = 'toast ' + type + ' show'; setTimeout(() => toast.className = 'toast', 3000); }
        loadProviders();
    </script>
</body>
</html>`
	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}
