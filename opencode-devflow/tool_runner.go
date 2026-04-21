package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ToolRunner executes OpenCode-style tools
type ToolRunner struct {
	workDir string
}

type ToolResult struct {
	Success bool   `json:"success"`
	Content string `json:"content"`
	Error   string `json:"error,omitempty"`
}

func NewToolRunner(workDir string) *ToolRunner {
	if workDir == "" {
		workDir = "."
	}
	return &ToolRunner{workDir: workDir}
}

// ExecuteTool runs a tool by name with given params
func (tr *ToolRunner) ExecuteTool(name string, params map[string]interface{}) ToolResult {
	switch name {
	case "view":
		return tr.toolView(params)
	case "write":
		return tr.toolWrite(params)
	case "edit":
		return tr.toolEdit(params)
	case "ls":
		return tr.toolLS(params)
	case "grep":
		return tr.toolGrep(params)
	case "glob":
		return tr.toolGlob(params)
	case "bash":
		return tr.toolBash(params)
	default:
		return ToolResult{Success: false, Error: fmt.Sprintf("Unknown tool: %s", name)}
	}
}

// view tool - read file with line numbers
func (tr *ToolRunner) toolView(params map[string]interface{}) ToolResult {
	filePath, ok := params["file_path"].(string)
	if !ok || filePath == "" {
		return ToolResult{Success: false, Error: "file_path is required"}
	}

	// Handle relative paths
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(tr.workDir, filePath)
	}

	file, err := os.Open(filePath)
	if err != nil {
		return ToolResult{Success: false, Error: fmt.Sprintf("Error reading file: %v", err)}
	}
	defer file.Close()

	offset := 0
	limit := 2000
	if offsetVal, ok := params["offset"].(float64); ok {
		offset = int(offsetVal)
	}
	if limitVal, ok := params["limit"].(float64); ok {
		limit = int(limitVal)
	}

	scanner := bufio.NewScanner(file)
	lineNum := 0
	var lines []string
	var content strings.Builder

	for scanner.Scan() {
		lineNum++
		if lineNum <= offset {
			continue
		}
		if lineNum > offset+limit {
			break
		}
		lines = append(lines, fmt.Sprintf("%6d|%s", lineNum, scanner.Text()))
	}

	content.WriteString("<file>\n")
	content.WriteString(strings.Join(lines, "\n"))
	content.WriteString("\n</file>\n")

	if lineNum > offset+limit {
		content.WriteString(fmt.Sprintf("\n(File has %d more lines. Use 'offset' to read more.)\n", lineNum-offset-limit))
	}

	return ToolResult{Success: true, Content: content.String()}
}

// write tool - create or overwrite file
func (tr *ToolRunner) toolWrite(params map[string]interface{}) ToolResult {
	filePath, ok := params["file_path"].(string)
	if !ok || filePath == "" {
		return ToolResult{Success: false, Error: "file_path is required"}
	}

	content, ok := params["content"].(string)
	if !ok {
		return ToolResult{Success: false, Error: "content is required"}
	}

	// Handle relative paths
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(tr.workDir, filePath)
	}

	// Create parent directories
	if parent := filepath.Dir(filePath); parent != "." {
		os.MkdirAll(parent, 0755)
	}

	err := os.WriteFile(filePath, []byte(content), 0644)
	if err != nil {
		return ToolResult{Success: false, Error: fmt.Sprintf("Error writing file: %v", err)}
	}

	return ToolResult{Success: true, Content: fmt.Sprintf("File successfully written: %s", filePath)}
}

// edit tool - replace old_string with new_string
func (tr *ToolRunner) toolEdit(params map[string]interface{}) ToolResult {
	filePath, ok := params["file_path"].(string)
	if !ok || filePath == "" {
		return ToolResult{Success: false, Error: "file_path is required"}
	}

	oldString, ok := params["old_string"].(string)
	if !ok || oldString == "" {
		return ToolResult{Success: false, Error: "old_string is required"}
	}

	newString, ok := params["new_string"].(string)
	if !ok {
		return ToolResult{Success: false, Error: "new_string is required"}
	}

	// Handle relative paths
	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(tr.workDir, filePath)
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return ToolResult{Success: false, Error: fmt.Sprintf("Error reading file: %v", err)}
	}

	if !strings.Contains(string(content), oldString) {
		return ToolResult{Success: false, Error: "old_string not found in file"}
	}

	newContent := strings.Replace(string(content), oldString, newString, 1)
	err = os.WriteFile(filePath, []byte(newContent), 0644)
	if err != nil {
		return ToolResult{Success: false, Error: fmt.Sprintf("Error writing file: %v", err)}
	}

	return ToolResult{Success: true, Content: fmt.Sprintf("File successfully edited: %s", filePath)}
}

// ls tool - list directory
func (tr *ToolRunner) toolLS(params map[string]interface{}) ToolResult {
	path := "."
	if pathVal, ok := params["path"].(string); ok && pathVal != "" {
		path = pathVal
	}

	// Handle relative paths
	if !filepath.IsAbs(path) {
		path = filepath.Join(tr.workDir, path)
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return ToolResult{Success: false, Error: fmt.Sprintf("Error reading directory: %v", err)}
	}

	var result []string
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() {
			result = append(result, name+"/")
		} else {
			result = append(result, name)
		}
	}

	return ToolResult{Success: true, Content: strings.Join(result, "\n")}
}

// grep tool - search for pattern in files
func (tr *ToolRunner) toolGrep(params map[string]interface{}) ToolResult {
	pattern, ok := params["pattern"].(string)
	if !ok || pattern == "" {
		return ToolResult{Success: false, Error: "pattern is required"}
	}

	path := tr.workDir
	if pathVal, ok := params["path"].(string); ok && pathVal != "" {
		path = pathVal
		if !filepath.IsAbs(path) {
			path = filepath.Join(tr.workDir, path)
		}
	}

	include := ""
	if includeVal, ok := params["include"].(string); ok {
		include = includeVal
	}

	matches := tr.searchDir(path, pattern, include, 0)
	if len(matches) == 0 {
		return ToolResult{Success: true, Content: fmt.Sprintf("No files found matching '%s' in %s", pattern, path)}
	}

	return ToolResult{Success: true, Content: strings.Join(matches, "\n")}
}

func (tr *ToolRunner) searchDir(dir, pattern, include string, depth int) []string {
	if depth > 10 {
		return nil
	}

	var matches []string
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	re := regexp.MustCompile("(?i)" + pattern)

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}

		path := filepath.Join(dir, name)
		if entry.IsDir() {
			matches = append(matches, tr.searchDir(path, pattern, include, depth+1)...)
		} else {
			if include != "" && !matchesInclude(name, include) {
				continue
			}
			content, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			scanner := bufio.NewScanner(strings.NewReader(string(content)))
			lineNum := 0
			for scanner.Scan() {
				lineNum++
				if re.MatchString(scanner.Text()) {
					matches = append(matches, fmt.Sprintf("%s:%d:%s", path, lineNum, scanner.Text()))
				}
			}
		}
	}

	return matches
}

func matchesInclude(filename, pattern string) bool {
	pattern = strings.ToLower(pattern)
	filename = strings.ToLower(filename)
	if strings.Contains("*", pattern) {
		pattern = strings.ReplaceAll(pattern, "*", "")
		return strings.HasSuffix(filename, pattern)
	}
	return strings.Contains(filename, pattern)
}

// glob tool - find files matching pattern
func (tr *ToolRunner) toolGlob(params map[string]interface{}) ToolResult {
	pattern, ok := params["pattern"].(string)
	if !ok || pattern == "" {
		return ToolResult{Success: false, Error: "pattern is required"}
	}

	path := tr.workDir
	if pathVal, ok := params["path"].(string); ok && pathVal != "" {
		path = pathVal
		if !filepath.IsAbs(path) {
			path = filepath.Join(tr.workDir, path)
		}
	}

	matches := tr.globDir(path, pattern, 0)
	if len(matches) == 0 {
		return ToolResult{Success: true, Content: fmt.Sprintf("No files matching pattern '%s' found in %s", pattern, path)}
	}

	return ToolResult{Success: true, Content: strings.Join(matches, "\n")}
}

func (tr *ToolRunner) globDir(dir, pattern string, depth int) []string {
	if depth > 10 {
		return nil
	}

	var matches []string
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	patternLower := strings.ToLower(pattern)

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}

		path := filepath.Join(dir, name)
		nameLower := strings.ToLower(name)

		// Simple glob matching
		if strings.Contains(patternLower, "**") {
			// Handle ** pattern
			globPattern := strings.ReplaceAll(patternLower, "**/", ".*/")
			globPattern = strings.ReplaceAll(globPattern, "**", ".*")
			globPattern = strings.ReplaceAll(globPattern, "*", "[^/]*")
			re := regexp.MustCompile(globPattern)
			if re.MatchString(nameLower) {
				matches = append(matches, path)
			}
		} else if strings.Contains(patternLower, "*") {
			// Handle * pattern
			globPattern := strings.ReplaceAll(patternLower, "*", "[^/]*")
			re := regexp.MustCompile(globPattern)
			if re.MatchString(nameLower) {
				matches = append(matches, path)
			}
		} else if strings.Contains(nameLower, patternLower) {
			matches = append(matches, path)
		}

		if entry.IsDir() {
			matches = append(matches, tr.globDir(path, pattern, depth+1)...)
		}
	}

	return matches
}

// bash tool - execute shell command
func (tr *ToolRunner) toolBash(params map[string]interface{}) ToolResult {
	command, ok := params["command"].(string)
	if !ok || command == "" {
		return ToolResult{Success: false, Error: "command is required"}
	}

	timeout := 60000 // default 60 seconds
	if timeoutVal, ok := params["timeout"].(float64); ok {
		timeout = int(timeoutVal)
	}

	// Security check for dangerous commands
	dangerous := []string{"rm -rf /", "mkfs", "dd if="}
	for _, d := range dangerous {
		if strings.Contains(command, d) {
			return ToolResult{Success: false, Error: "Command not allowed for security reasons"}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = tr.workDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return ToolResult{Success: false, Error: fmt.Sprintf("Command timed out after %dms", timeout)}
		}
		return ToolResult{Success: true, Content: string(output), Error: err.Error()}
	}

	return ToolResult{Success: true, Content: string(output)}
}

// ParseToolCall parses a tool call from JSON
func ParseToolCall(input string) (name string, params map[string]interface{}, err error) {
	var tc struct {
		Name  string                 `json:"name"`
		Input map[string]interface{} `json:"input"`
	}
	if err := json.Unmarshal([]byte(input), &tc); err != nil {
		return "", nil, err
	}
	return tc.Name, tc.Input, nil
}
