package tools

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

type Runner struct {
	workDir string
}

type Result struct {
	Success bool   `json:"success"`
	Content string `json:"content"`
	Error   string `json:"error,omitempty"`
}

func NewRunner(workDir string) *Runner {
	if workDir == "" {
		workDir = "."
	}
	return &Runner{workDir: workDir}
}

func (tr *Runner) Execute(name string, params map[string]interface{}) Result {
	switch name {
	case "view":
		return tr.view(params)
	case "write":
		return tr.write(params)
	case "edit":
		return tr.edit(params)
	case "ls":
		return tr.ls(params)
	case "grep":
		return tr.grep(params)
	case "glob":
		return tr.glob(params)
	case "bash":
		return tr.bash(params)
	default:
		return Result{Success: false, Error: fmt.Sprintf("Unknown tool: %s", name)}
	}
}

func (tr *Runner) view(params map[string]interface{}) Result {
	filePath, ok := params["file_path"].(string)
	if !ok || filePath == "" {
		return Result{Success: false, Error: "file_path is required"}
	}

	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(tr.workDir, filePath)
	}

	file, err := os.Open(filePath)
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("Error reading file: %v", err)}
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

	return Result{Success: true, Content: content.String()}
}

func (tr *Runner) write(params map[string]interface{}) Result {
	filePath, ok := params["file_path"].(string)
	if !ok || filePath == "" {
		return Result{Success: false, Error: "file_path is required"}
	}

	content, ok := params["content"].(string)
	if !ok {
		return Result{Success: false, Error: "content is required"}
	}

	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(tr.workDir, filePath)
	}

	if parent := filepath.Dir(filePath); parent != "." {
		os.MkdirAll(parent, 0755)
	}

	err := os.WriteFile(filePath, []byte(content), 0644)
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("Error writing file: %v", err)}
	}

	return Result{Success: true, Content: fmt.Sprintf("File successfully written: %s", filePath)}
}

func (tr *Runner) edit(params map[string]interface{}) Result {
	filePath, ok := params["file_path"].(string)
	if !ok || filePath == "" {
		return Result{Success: false, Error: "file_path is required"}
	}

	oldString, ok := params["old_string"].(string)
	if !ok || oldString == "" {
		return Result{Success: false, Error: "old_string is required"}
	}

	newString, ok := params["new_string"].(string)
	if !ok {
		return Result{Success: false, Error: "new_string is required"}
	}

	if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(tr.workDir, filePath)
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("Error reading file: %v", err)}
	}

	if !strings.Contains(string(content), oldString) {
		return Result{Success: false, Error: "old_string not found in file"}
	}

	newContent := strings.Replace(string(content), oldString, newString, 1)
	err = os.WriteFile(filePath, []byte(newContent), 0644)
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("Error writing file: %v", err)}
	}

	return Result{Success: true, Content: fmt.Sprintf("File successfully edited: %s", filePath)}
}

func (tr *Runner) ls(params map[string]interface{}) Result {
	path := "."
	if pathVal, ok := params["path"].(string); ok && pathVal != "" {
		path = pathVal
	}

	if !filepath.IsAbs(path) {
		path = filepath.Join(tr.workDir, path)
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("Error reading directory: %v", err)}
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

	return Result{Success: true, Content: strings.Join(result, "\n")}
}

func (tr *Runner) grep(params map[string]interface{}) Result {
	pattern, ok := params["pattern"].(string)
	if !ok || pattern == "" {
		return Result{Success: false, Error: "pattern is required"}
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
		return Result{Success: true, Content: fmt.Sprintf("No files found matching '%s' in %s", pattern, path)}
	}

	return Result{Success: true, Content: strings.Join(matches, "\n")}
}

func (tr *Runner) searchDir(dir, pattern, include string, depth int) []string {
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
	if strings.Contains(pattern, "*") {
		pattern = strings.ReplaceAll(pattern, "*", "")
		return strings.HasSuffix(filename, pattern)
	}
	return strings.Contains(filename, pattern)
}

func (tr *Runner) glob(params map[string]interface{}) Result {
	pattern, ok := params["pattern"].(string)
	if !ok || pattern == "" {
		return Result{Success: false, Error: "pattern is required"}
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
		return Result{Success: true, Content: fmt.Sprintf("No files matching pattern '%s' found in %s", pattern, path)}
	}

	return Result{Success: true, Content: strings.Join(matches, "\n")}
}

func (tr *Runner) globDir(dir, pattern string, depth int) []string {
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

		if strings.Contains(patternLower, "**") {
			globPattern := strings.ReplaceAll(patternLower, "**/", ".*/")
			globPattern = strings.ReplaceAll(globPattern, "**", ".*")
			globPattern = strings.ReplaceAll(globPattern, "*", "[^/]*")
			re := regexp.MustCompile(globPattern)
			if re.MatchString(nameLower) {
				matches = append(matches, path)
			}
		} else if strings.Contains(patternLower, "*") {
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

func (tr *Runner) bash(params map[string]interface{}) Result {
	command, ok := params["command"].(string)
	if !ok || command == "" {
		return Result{Success: false, Error: "command is required"}
	}

	timeout := 60000
	if timeoutVal, ok := params["timeout"].(float64); ok {
		timeout = int(timeoutVal)
	}

	dangerous := []string{"rm -rf /", "mkfs", "dd if="}
	for _, d := range dangerous {
		if strings.Contains(command, d) {
			return Result{Success: false, Error: "Command not allowed for security reasons"}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Millisecond)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = tr.workDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return Result{Success: false, Error: fmt.Sprintf("Command timed out after %dms", timeout)}
		}
		return Result{Success: true, Content: string(output), Error: err.Error()}
	}

	return Result{Success: true, Content: string(output)}
}

type ToolCall struct {
	Name      string
	Input     string
}

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
