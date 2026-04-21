package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"sync"

	"github.com/opencode-ai/opencode-devflow/skills"
	"github.com/opencode-ai/opencode-devflow/tools"
)

type Server struct {
	port    int
	workDir string
	runner  *tools.Runner
	server  *http.Server
	mu      sync.RWMutex
}

type MCPRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	ID      interface{}     `json:"id,omitempty"`
}

type MCPResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *MCPError   `json:"error,omitempty"`
	ID      interface{} `json:"id,omitempty"`
}

type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

type InitializeResult struct {
	ProtocolVersion string   `json:"protocolVersion"`
	Capabilities    Capability `json:"capabilities"`
	ServerInfo      ServerInfo `json:"serverInfo"`
}

type Capability struct {
	Tools bool `json:"tools"`
}

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type ListToolsResult struct {
	Tools []Tool `json:"tools"`
}

func NewServer(port int, workDir string) *Server {
	if workDir == "" {
		workDir, _ = os.Getwd()
	}
	return &Server{
		port:    port,
		workDir: workDir,
		runner:  tools.NewRunner(workDir),
	}
}

func (s *Server) Run(ctx context.Context) error {
	mux := http.NewServeMux()

	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/mcp", s.handleMCP)
	mux.HandleFunc("/health", s.handleHealth)

	addr := fmt.Sprintf(":%d", s.port)
	s.server = &http.Server{Addr: addr, Handler: mux}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", s.port, err)
	}

	log.Printf("MCP server listening on http://localhost%s", ln.Addr().String())
	log.Printf("Health check: http://localhost%s/health", ln.Addr().String())
	log.Printf("MCP endpoint: http://localhost%s/mcp", ln.Addr().String())

	return s.server.Serve(ln)
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprintln(w, "<html><head><title>DevFlow MCP Server</title></head><body>")
	fmt.Fprintln(w, "<h1>DevFlow MCP Server</h1>")
	fmt.Fprintln(w, "<p>Available endpoints:</p>")
	fmt.Fprintln(w, "<ul>")
	fmt.Fprintln(w, `<li><a href="/health">/health</a> - Health check</li>`)
	fmt.Fprintln(w, `<li><a href="/mcp">/mcp</a> - MCP protocol endpoint</li>`)
	fmt.Fprintln(w, "</ul>")
	fmt.Fprintln(w, "<h2>Available Skills by Role</h2>")
	fmt.Fprintln(w, "<pre>")
	for _, role := range []skills.Role{skills.RoleProduct, skills.RoleDesign, skills.RoleDevelop, skills.RoleTest, skills.RoleOps} {
		fmt.Fprintf(w, "[%s]\n", role.String())
		roleSkills := skills.GetSkillsForRole(role)
		for _, sk := range roleSkills {
			fmt.Fprintf(w, "  * %s: %s\n", sk.Name, sk.Description)
		}
		fmt.Fprintln(w)
	}
	fmt.Fprintln(w, "</pre>")
	fmt.Fprintln(w, "</body></html>")
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"server":  "devflow-mcp",
		"version": "0.1.0",
		"roles":   skills.GetAllRoles(),
	})
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "POST" && r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	var req MCPRequest
	if r.Method == "POST" {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.sendError(w, nil, -32700, "Parse error")
			return
		}
	}

	resp := s.handleRequest(req)
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleRequest(req MCPRequest) MCPResponse {
	s.mu.RLock()
	defer s.mu.RUnlock()

	switch req.Method {
	case "initialize":
		return MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: InitializeResult{
				ProtocolVersion: "2024-11-05",
				Capabilities:    Capability{Tools: true},
				ServerInfo: ServerInfo{
					Name:    "devflow-mcp",
					Version: "0.1.0",
				},
			},
		}

	case "tools/list":
		tools := s.getTools()
		return MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: ListToolsResult{Tools: tools},
		}

	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return MCPResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &MCPError{Code: -32602, Message: "Invalid params"},
			}
		}

		result := s.runner.Execute(params.Name, params.Arguments)
		var content []map[string]interface{}
		if result.Success {
			content = []map[string]interface{}{
				{"type": "text", "text": result.Content},
			}
		} else {
			content = []map[string]interface{}{
				{"type": "text", "text": result.Error},
			}
		}

		return MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]interface{}{
				"content": content,
			},
		}

	default:
		return MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &MCPError{Code: -32601, Message: fmt.Sprintf("Method not found: %s", req.Method)},
		}
	}
}

func (s *Server) getTools() []Tool {
	toolNames := skills.GetAllTools()
	tools := make([]Tool, 0, len(toolNames))

	toolDescriptions := map[string]string{
		"view":  "Read file contents with line numbers",
		"write": "Create or overwrite a file",
		"edit":  "Replace old_string with new_string in a file",
		"ls":    "List directory contents",
		"grep":  "Search for pattern in files",
		"glob":  "Find files matching pattern",
		"bash":  "Execute shell command",
	}

	toolSchemas := map[string]map[string]interface{}{
		"view": {
			"type": "object",
			"properties": map[string]interface{}{
				"file_path": map[string]interface{}{"type": "string"},
				"offset":    map[string]interface{}{"type": "integer"},
				"limit":     map[string]interface{}{"type": "integer"},
			},
			"required": []string{"file_path"},
		},
		"write": {
			"type": "object",
			"properties": map[string]interface{}{
				"file_path": map[string]interface{}{"type": "string"},
				"content":   map[string]interface{}{"type": "string"},
			},
			"required": []string{"file_path", "content"},
		},
		"edit": {
			"type": "object",
			"properties": map[string]interface{}{
				"file_path":  map[string]interface{}{"type": "string"},
				"old_string": map[string]interface{}{"type": "string"},
				"new_string": map[string]interface{}{"type": "string"},
			},
			"required": []string{"file_path", "old_string", "new_string"},
		},
		"ls": {
			"type": "object",
			"properties": map[string]interface{}{
				"path": map[string]interface{}{"type": "string"},
			},
		},
		"grep": {
			"type": "object",
			"properties": map[string]interface{}{
				"pattern": map[string]interface{}{"type": "string"},
				"path":    map[string]interface{}{"type": "string"},
				"include": map[string]interface{}{"type": "string"},
			},
			"required": []string{"pattern"},
		},
		"glob": {
			"type": "object",
			"properties": map[string]interface{}{
				"pattern": map[string]interface{}{"type": "string"},
				"path":   map[string]interface{}{"type": "string"},
			},
			"required": []string{"pattern"},
		},
		"bash": {
			"type": "object",
			"properties": map[string]interface{}{
				"command": map[string]interface{}{"type": "string"},
				"timeout": map[string]interface{}{"type": "number"},
			},
			"required": []string{"command"},
		},
	}

	for _, name := range toolNames {
		desc := toolDescriptions[name]
		if desc == "" {
			desc = name + " tool"
		}
		schema := toolSchemas[name]
		if schema == nil {
			schema = map[string]interface{}{"type": "object"}
		}
		tools = append(tools, Tool{
			Name:        name,
			Description: desc,
			InputSchema: schema,
		})
	}

	return tools
}

func (s *Server) sendError(w http.ResponseWriter, id interface{}, code int, message string) {
	resp := MCPResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &MCPError{Code: code, Message: message},
	}
	json.NewEncoder(w).Encode(resp)
}
