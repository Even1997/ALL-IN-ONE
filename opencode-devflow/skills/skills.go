package skills

import (
	"fmt"
	"strings"
)

type Role string

const (
	RoleProduct  Role = "product"
	RoleDesign   Role = "design"
	RoleDevelop  Role = "develop"
	RoleTest     Role = "test"
	RoleOps      Role = "ops"
)

func (r Role) String() string {
	return string(r)
}

type Skill struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Tools       []string `json:"tools"` // MCP tools this skill uses
	Prompt      string   `json:"prompt"` // System prompt for this skill
}

type RoleConfig struct {
	Role         Role
	Name         string
	Description  string
	SystemPrompt string
	Skills       []Skill
}

var roleConfigs = []RoleConfig{
	{
		Role:        RoleProduct,
		Name:        "Product Manager",
		Description: "Requirements analysis, user stories, specifications",
		SystemPrompt: `You are a Product Manager assistant. Help with:
- Requirements gathering and analysis
- Writing user stories and acceptance criteria
- Creating product specifications
- Feature prioritization (MoSCoW, RICE, etc.)
- User journey mapping
- Competitive analysis`,
		Skills: []Skill{
			{
				Name:        "analyze_requirements",
				Description: "Analyze and structure requirements from user input",
				Tools:       []string{"view", "grep"},
				Prompt:      "Analyze requirements and create structured specs",
			},
			{
				Name:        "write_user_story",
				Description: "Write user stories with acceptance criteria",
				Tools:       []string{"write", "edit"},
				Prompt:      "Write user story in standard template",
			},
			{
				Name:        "create_spec",
				Description: "Create product specification document",
				Tools:       []string{"write"},
				Prompt:      "Create detailed product specification",
			},
			{
				Name:        "prioritize",
				Description: "Prioritize features using industry methods",
				Tools:       []string{},
				Prompt:      "Prioritize features using MoSCoW/RICE method",
			},
			{
				Name:        "generate_prd",
				Description: "Generate Product Requirements Document",
				Tools:       []string{"write", "ls"},
				Prompt:      "Generate comprehensive PRD",
			},
		},
	},
	{
		Role:        RoleDesign,
		Name:        "UI Designer",
		Description: "Layout design, component creation, prototyping",
		SystemPrompt: `You are a UI/UX Designer assistant. Help with:
- Creating page layouts and wireframes
- Designing UI components and patterns
- Color schemes and typography
- Responsive design considerations
- Accessibility (WCAG) guidelines
- Design system creation`,
		Skills: []Skill{
			{
				Name:        "layout_design",
				Description: "Design page layouts and structure",
				Tools:       []string{"view", "write"},
				Prompt:      "Design page layout with component hierarchy",
			},
			{
				Name:        "component_design",
				Description: "Design reusable UI components",
				Tools:       []string{"write", "edit"},
				Prompt:      "Design component with props, states, variants",
			},
			{
				Name:        "design_system",
				Description: "Create design system tokens and patterns",
				Tools:       []string{"write", "glob"},
				Prompt:      "Create design system with tokens",
			},
			{
				Name:        "accessibility_check",
				Description: "Check design for accessibility compliance",
				Tools:       []string{"grep", "view"},
				Prompt:      "Check WCAG compliance",
			},
			{
				Name:        "responsive_check",
				Description: "Review responsive design breakpoints",
				Tools:       []string{"grep", "bash"},
				Prompt:      "Check responsive breakpoints",
			},
		},
	},
	{
		Role:        RoleDevelop,
		Name:        "Developer",
		Description: "Code implementation, refactoring, debugging",
		SystemPrompt: `You are a Developer assistant. Help with:
- Writing clean, maintainable code
- Code refactoring and optimization
- Bug identification and fixing
- API design and implementation
- Database schema design
- Testing strategy`,
		Skills: []Skill{
			{
				Name:        "write_code",
				Description: "Write implementation code",
				Tools:       []string{"view", "write", "edit"},
				Prompt:      "Write clean, production-ready code",
			},
			{
				Name:        "refactor",
				Description: "Refactor existing code",
				Tools:       []string{"view", "edit"},
				Prompt:      "Refactor code for better maintainability",
			},
			{
				Name:        "debug",
				Description: "Debug issues and suggest fixes",
				Tools:       []string{"view", "grep", "bash"},
				Prompt:      "Analyze and fix bugs",
			},
			{
				Name:        "design_api",
				Description: "Design REST/GraphQL APIs",
				Tools:       []string{"write", "glob"},
				Prompt:      "Design clean API endpoints",
			},
			{
				Name:        "write_tests",
				Description: "Write unit and integration tests",
				Tools:       []string{"write", "bash"},
				Prompt:      "Write comprehensive tests",
			},
			{
				Name:        "code_review",
				Description: "Review code and suggest improvements",
				Tools:       []string{"view", "grep"},
				Prompt:      "Review code with actionable feedback",
			},
		},
	},
	{
		Role:        RoleTest,
		Name:        "QA Engineer",
		Description: "Test planning, bug reporting, quality assurance",
		SystemPrompt: `You are a QA Engineer assistant. Help with:
- Test plan creation and management
- Test case design (positive/negative/edge)
- Bug report writing with clear reproduction steps
- Test automation strategy
- Regression testing planning
- Performance testing considerations`,
		Skills: []Skill{
			{
				Name:        "write_test_plan",
				Description: "Create comprehensive test plan",
				Tools:       []string{"write", "view"},
				Prompt:      "Create detailed test plan",
			},
			{
				Name:        "write_test_cases",
				Description: "Write detailed test cases",
				Tools:       []string{"write", "edit"},
				Prompt:      "Write test cases with steps and expected results",
			},
			{
				Name:        "report_bug",
				Description: "Write detailed bug reports",
				Tools:       []string{"write"},
				Prompt:      "Report bug with reproduction steps",
			},
			{
				Name:        "test_strategy",
				Description: "Design testing strategy",
				Tools:       []string{"view", "grep"},
				Prompt:      "Define testing approach and priorities",
			},
			{
				Name:        "automate_tests",
				Description: "Suggest test automation approach",
				Tools:       []string{"write", "grep"},
				Prompt:      "Suggest automation framework and cases",
			},
		},
	},
	{
		Role:        RoleOps,
		Name:        "Operations",
		Description: "Deployment, monitoring, DevOps practices",
		SystemPrompt: `You are a DevOps/Operations assistant. Help with:
- CI/CD pipeline configuration
- Container orchestration (Docker, K8s)
- Cloud infrastructure (AWS, GCP, Azure)
- Monitoring and alerting setup
- Log management and analysis
- Security best practices`,
		Skills: []Skill{
			{
				Name:        "ci_cd_pipeline",
				Description: "Design CI/CD pipeline",
				Tools:       []string{"write", "glob", "bash"},
				Prompt:      "Design CI/CD pipeline with stages",
			},
			{
				Name:        "dockerfile",
				Description: "Create Docker configurations",
				Tools:       []string{"write", "edit"},
				Prompt:      "Create optimized Dockerfile",
			},
			{
				Name:        "k8s_manifest",
				Description: "Create Kubernetes manifests",
				Tools:       []string{"write", "edit"},
				Prompt:      "Create K8s deployment and service configs",
			},
			{
				Name:        "monitoring",
				Description: "Design monitoring and alerting",
				Tools:       []string{"write", "grep"},
				Prompt:      "Set up monitoring dashboards and alerts",
			},
			{
				Name:        "infrastructure",
				Description: "Design infrastructure as code",
				Tools:       []string{"write", "glob"},
				Prompt:      "Design IaC for cloud resources",
			},
			{
				Name:        "security_scan",
				Description: "Check for security issues",
				Tools:       []string{"grep", "bash"},
				Prompt:      "Run security checks and audits",
			},
		},
	},
}

func GetSkillsForRole(role Role) []Skill {
	for _, cfg := range roleConfigs {
		if cfg.Role == role {
			return cfg.Skills
		}
	}
	return nil
}

func GetRoleConfig(role Role) *RoleConfig {
	for _, cfg := range roleConfigs {
		if cfg.Role == role {
			return &cfg
		}
	}
	return nil
}

func GetAllRoles() []Role {
	roles := make([]Role, len(roleConfigs))
	for i, cfg := range roleConfigs {
		roles[i] = cfg.Role
	}
	return roles
}

func GetSystemPrompt(role Role) string {
	cfg := GetRoleConfig(role)
	if cfg == nil {
		return ""
	}
	return cfg.SystemPrompt
}

func ParseRole(s string) (Role, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, cfg := range roleConfigs {
		if strings.ToLower(string(cfg.Role)) == s ||
			strings.ToLower(cfg.Name) == s {
			return cfg.Role, nil
		}
	}
	return "", fmt.Errorf("unknown role: %s", s)
}

func GetAllTools() []string {
	toolSet := make(map[string]bool)
	for _, cfg := range roleConfigs {
		for _, skill := range cfg.Skills {
			for _, tool := range skill.Tools {
				toolSet[tool] = true
			}
		}
	}
	tools := make([]string, 0, len(toolSet))
	for tool := range toolSet {
		tools = append(tools, tool)
	}
	return tools
}
