package store

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Feature represents a single feature item
type Feature struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Level     string    `json:"level"`
	LevelText string    `json:"levelText"`
	Desc      string    `json:"desc"`
	Parent    string    `json:"parent,omitempty"`
	Children  []*Feature `json:"-"`
}

type FeatureStore struct {
	path     string
	features []*Feature
	index    map[string]*Feature // id -> feature
	mu       sync.RWMutex
}

func NewFeatureStore(dataDir string) (*FeatureStore, error) {
	path := filepath.Join(dataDir, "features.md")

	fs := &FeatureStore{
		path:     path,
		features: []*Feature{},
		index:    make(map[string]*Feature),
	}

	// Ensure data directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	if err := fs.Load(); err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
		// File doesn't exist yet, save default content
		fs.Save()
	}

	return fs, nil
}

func (fs *FeatureStore) Load() error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	data, err := os.ReadFile(fs.path)
	if err != nil {
		return err
	}

	fs.features, err = ParseMD(bytes.NewReader(data))
	if err != nil {
		// If parse fails, start with empty
		fs.features = []*Feature{}
	}

	fs.rebuildIndex()
	return nil
}

func (fs *FeatureStore) Save() error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	return fs.saveLocked()
}

func (fs *FeatureStore) saveLocked() error {
	content := SerializeMD(fs.features)
	return os.WriteFile(fs.path, []byte(content), 0644)
}

func (fs *FeatureStore) rebuildIndex() {
	fs.index = make(map[string]*Feature)
	for _, f := range fs.features {
		fs.index[f.ID] = f
	}
}

// GetAll returns all features
func (fs *FeatureStore) GetAll() []*Feature {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	result := make([]*Feature, len(fs.features))
	for i, f := range fs.features {
		// Return a copy to avoid race conditions
		fcopy := *f
		result[i] = &fcopy
	}
	return result
}

// GetByID returns a feature by ID
func (fs *FeatureStore) GetByID(id string) *Feature {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	if f, ok := fs.index[id]; ok {
		return f
	}
	return nil
}

// Create adds a new feature
func (fs *FeatureStore) Create(f *Feature) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	fs.features = append(fs.features, f)
	fs.index[f.ID] = f
	return fs.saveLocked()
}

// Update modifies an existing feature
func (fs *FeatureStore) Update(id string, updates map[string]interface{}) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	f, ok := fs.index[id]
	if !ok {
		return fmt.Errorf("feature not found: %s", id)
	}

	if name, ok := updates["name"].(string); ok {
		f.Name = name
	}
	if level, ok := updates["level"].(string); ok {
		f.Level = level
	}
	if levelText, ok := updates["levelText"].(string); ok {
		f.LevelText = levelText
	}
	if desc, ok := updates["desc"].(string); ok {
		f.Desc = desc
	}
	if parent, ok := updates["parent"].(string); ok {
		if parent == "" {
			f.Parent = ""
		} else {
			f.Parent = parent
		}
	}

	return fs.saveLocked()
}

// Delete removes a feature and all its descendants
func (fs *FeatureStore) Delete(id string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	deleteIds := fs.getDescendantIds(id)
	deleteIds[id] = true

	newFeatures := make([]*Feature, 0, len(fs.features))
	for _, f := range fs.features {
		if !deleteIds[f.ID] {
			newFeatures = append(newFeatures, f)
		}
	}

	fs.features = newFeatures
	fs.rebuildIndex()
	return fs.saveLocked()
}

// GetChildren returns direct children of a feature
func (fs *FeatureStore) GetChildren(id string) []*Feature {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	var children []*Feature
	for _, f := range fs.features {
		if f.Parent == id {
			fcopy := *f
			children = append(children, &fcopy)
		}
	}
	return children
}

func (fs *FeatureStore) getDescendantIds(id string) map[string]bool {
	ids := make(map[string]bool)
	queue := []string{id}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		for _, f := range fs.features {
			if f.Parent == current && !ids[f.ID] {
				ids[f.ID] = true
				queue = append(queue, f.ID)
			}
		}
	}

	return ids
}

// GetTree returns a tree structure for frontend rendering
func (fs *FeatureStore) GetTree() []*Feature {
	fs.mu.RLock()
	defer fs.mu.RUnlock()

	// Build tree
	nodeMap := make(map[string]*Feature)
	for _, f := range fs.features {
		fcopy := *f
		fcopy.Children = []*Feature{}
		nodeMap[f.ID] = &fcopy
	}

	var roots []*Feature
	for _, f := range fs.features {
		node := nodeMap[f.ID]
		if f.Parent == "" {
			roots = append(roots, node)
		} else if parent, ok := nodeMap[f.Parent]; ok {
			parent.Children = append(parent.Children, node)
		} else {
			// Orphan node, treat as root
			roots = append(roots, node)
		}
	}

	return roots
}

func (fs *FeatureStore) Path() string {
	return fs.path
}

// ParseMD parses features from markdown format
func ParseMD(r *bytes.Reader) ([]*Feature, error) {
	var features []*Feature
	scanner := bufio.NewScanner(r)

	var currentFeature *Feature
	var descLines []string

	for scanner.Scan() {
		line := scanner.Text()

		// Feature header: ## [LEVEL] Feature Name <!-- id=xxx -->
		if strings.HasPrefix(line, "## ") {
			// Save previous feature
			if currentFeature != nil {
				currentFeature.Desc = strings.TrimRight(strings.Join(descLines, "\n"), "\n")
				features = append(features, currentFeature)
				descLines = []string{}
			}

			// Parse: ## [critical] 用户登录功能 <!-- id=f_123 -->
			// or: ## [🔴 紧急] 用户登录功能 <!-- id=f_123 -->
			line = strings.TrimPrefix(line, "## ")

			// Extract ID from comment
			id := ""
			parent := ""
			if idx := strings.Index(line, "<!--"); idx != -1 {
				comment := line[idx+4 : strings.Index(line, "-->")]
				// Parse each key::value pair in the comment
				for _, part := range strings.Fields(comment) {
					part = strings.TrimSpace(part)
					if strings.HasPrefix(part, "id=") {
						id = strings.TrimPrefix(part, "id=")
					}
					if strings.HasPrefix(part, "parent::") {
						parent = strings.TrimPrefix(part, "parent::")
					}
				}
				line = strings.TrimSpace(line[:idx])
			}

			// Extract level from brackets
			level := "medium"
			levelText := "中"
			if strings.HasPrefix(line, "[") {
				idx := strings.Index(line, "]")
				if idx != -1 {
					levelStr := line[1:idx]
					line = strings.TrimSpace(line[idx+1:])

					switch levelStr {
					case "critical", "🔴 紧急", "🔴":
						level = "critical"
						levelText = "紧急"
					case "high", "🟠 高", "🟠":
						level = "high"
						levelText = "高"
					case "medium", "🟡 中", "🟡":
						level = "medium"
						levelText = "中"
					case "low", "🟢 低", "🟢":
						level = "low"
						levelText = "低"
					}
				}
			}

			name := strings.TrimSpace(line)

			currentFeature = &Feature{
				ID:        id,
				Name:      name,
				Level:     level,
				LevelText: levelText,
				Parent:    parent,
			}

		} else if currentFeature != nil {
			// Description content
			if strings.TrimSpace(line) == "" && len(descLines) == 0 {
				continue
			}
			descLines = append(descLines, line)
		}
	}

	// Save last feature
	if currentFeature != nil {
		currentFeature.Desc = strings.TrimRight(strings.Join(descLines, "\n"), "\n")
		features = append(features, currentFeature)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return features, nil
}

// SerializeMD converts features to markdown format
func SerializeMD(features []*Feature) string {
	var buf bytes.Buffer

	buf.WriteString("# 功能清单 (Features)\n\n")
	buf.WriteString("> 由 DevFlow 自动生成，请勿手动编辑\n\n")
	buf.WriteString("---\n\n")

	// Build tree structure for proper ordering
	nodeMap := make(map[string]*Feature)
	for _, f := range features {
		nodeMap[f.ID] = &Feature{
			ID:        f.ID,
			Name:      f.Name,
			Level:     f.Level,
			LevelText: f.LevelText,
			Desc:      f.Desc,
			Parent:    f.Parent,
			Children:  []*Feature{},
		}
	}

	// Find roots and build children
	var roots []*Feature
	for _, f := range features {
		if f.Parent == "" {
			roots = append(roots, nodeMap[f.ID])
		} else if parent, ok := nodeMap[f.Parent]; ok {
			parent.Children = append(parent.Children, nodeMap[f.ID])
		} else {
			roots = append(roots, nodeMap[f.ID])
		}
	}

	// Serialize tree recursively
	var serializeTree func([]*Feature, int)
	serializeTree = func(nodes []*Feature, depth int) {
		for _, f := range nodes {
			// Header with level emoji and ID comment
			var levelEmoji string
			switch f.Level {
			case "critical":
				levelEmoji = "🔴 紧急"
			case "high":
				levelEmoji = "🟠 高"
			case "medium":
				levelEmoji = "🟡 中"
			case "low":
				levelEmoji = "🟢 低"
			default:
				levelEmoji = "🟡 中"
			}

			header := fmt.Sprintf("## [%s] %s <!-- id=%s", levelEmoji, f.Name, f.ID)
			if f.Parent != "" {
				header += fmt.Sprintf(" parent::%s", f.Parent)
			}
			header += " -->\n"
			buf.WriteString(header)

			// Description
			if f.Desc != "" {
				buf.WriteString("\n")
				for _, line := range strings.Split(f.Desc, "\n") {
					buf.WriteString(line + "\n")
				}
			}

			buf.WriteString("\n")

			// Children
			if len(f.Children) > 0 {
				serializeTree(f.Children, depth+1)
			}
		}
	}

	serializeTree(roots, 0)

	return buf.String()
}