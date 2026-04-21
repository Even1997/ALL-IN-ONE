package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/opencode-ai/opencode-devflow/ai"
	"github.com/opencode-ai/opencode-devflow/mcp"
	"github.com/opencode-ai/opencode-devflow/skills"
	"github.com/opencode-ai/opencode-devflow/tools"
)

var (
	port       int
	apiKey     string
	model      string
	sessionID  string
	workDir    string
	outputJSON bool
	provider   string
)

var rootCmd = &cobra.Command{
	Use:   "devflow",
	Short: "DevFlow CLI - AI-powered development workflow",
	Long: `DevFlow is an AI-powered development workflow tool with role-based skills.

Roles:
  product    Product Manager - requirements, specs, user stories
  design     UI Designer - layouts, components, prototypes
  develop    Developer - code, refactor, debug
  test       QA Engineer - test plans, bug reports
  ops        Operations - deployment, monitoring, DevOps

Examples:
  devflow product "帮我写一个用户登录的需求文档"
  devflow develop "用Go实现一个HTTP服务器"
  devflow mcp --port 8080
  devflow chat --session abc123
`,
}

var productCmd = &cobra.Command{
	Use:   "product [prompt]",
	Short: "Product Manager mode - requirements and specs",
	Args:  cobra.MinimumNArgs(1),
	Run:   runRoleCommand(skills.RoleProduct),
}

var designCmd = &cobra.Command{
	Use:   "design [prompt]",
	Short: "UI Designer mode - layouts and components",
	Args:  cobra.MinimumNArgs(1),
	Run:   runRoleCommand(skills.RoleDesign),
}

var developCmd = &cobra.Command{
	Use:   "develop [prompt]",
	Short: "Developer mode - code and refactor",
	Args:  cobra.MinimumNArgs(1),
	Run:   runRoleCommand(skills.RoleDevelop),
}

var testCmd = &cobra.Command{
	Use:   "test [prompt]",
	Short: "QA Engineer mode - test and bug reports",
	Args:  cobra.MinimumNArgs(1),
	Run:   runRoleCommand(skills.RoleTest),
}

var opsCmd = &cobra.Command{
	Use:   "ops [prompt]",
	Short: "Operations mode - deployment and DevOps",
	Args:  cobra.MinimumNArgs(1),
	Run:   runRoleCommand(skills.RoleOps),
}

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Start MCP server for external AI integration",
	Run:   runMCPServer,
}

var chatCmd = &cobra.Command{
	Use:   "chat [prompt]",
	Short: "Interactive chat with AI",
	Args:  cobra.MinimumNArgs(1),
	Run:   runChat,
}

var skillsCmd = &cobra.Command{
	Use:   "skills [role]",
	Short: "List available skills for a role (or all roles)",
	Run:   listSkills,
}

var execCmd = &cobra.Command{
	Use:   "exec [role] [skill] [prompt]",
	Short: "Execute a specific skill",
	Args:  cobra.MinimumNArgs(3),
	Run:   runExecSkill,
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&workDir, "workdir", "w", ".", "Working directory")
	rootCmd.PersistentFlags().StringVarP(&apiKey, "api-key", "k", "", "AI API key (or set OPENCODE_API_KEY)")
	rootCmd.PersistentFlags().StringVarP(&model, "model", "m", "claude-sonnet-4-20250514", "AI model")
	rootCmd.PersistentFlags().BoolVarP(&outputJSON, "json", "j", false, "Output in JSON format")
	rootCmd.PersistentFlags().StringVarP(&provider, "provider", "p", "claude", "AI provider (claude, openai, gemini, claudecode)")

	mcpCmd.Flags().IntVarP(&port, "port", "p", 8080, "MCP server port")

	chatCmd.Flags().StringVarP(&sessionID, "session", "s", "", "Session ID for conversation continuity")

	rootCmd.AddCommand(productCmd, designCmd, developCmd, testCmd, opsCmd, mcpCmd, chatCmd, skillsCmd, execCmd)
}

func runRoleCommand(role skills.Role) func(cmd *cobra.Command, args []string) {
	return func(cmd *cobra.Command, args []string) {
		prompt := strings.Join(args, " ")

		// Load config and initialize AI
		aiCfg := getAIConfig()
		aiManager := ai.NewManager(aiCfg)

		// Get system prompt for role
		systemPrompt := skills.GetSystemPrompt(role)

		// Prepare messages
		messages := []ai.Message{
			{Role: "user", Content: prompt},
		}

		// Call AI
		providerType := ai.ProviderType(provider)
		ch, err := aiManager.SendMessage(context.Background(), providerType, messages, systemPrompt)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		// Stream response
		fmt.Printf("\n[%s AI Response]\n\n", role.String())
		for chunk := range ch {
			if chunk.Error != "" {
				fmt.Fprintf(os.Stderr, "Error: %s\n", chunk.Error)
				continue
			}
			if chunk.Content != "" {
				fmt.Print(chunk.Content)
			}
			if chunk.Done {
				fmt.Println()
			}
		}
	}
}

func runChat(cmd *cobra.Command, args []string) {
	prompt := strings.Join(args, " ")

	aiCfg := getAIConfig()
	aiManager := ai.NewManager(aiCfg)

	messages := []ai.Message{
		{Role: "user", Content: prompt},
	}

	providerType := ai.ProviderType(provider)
	ch, err := aiManager.SendMessage(context.Background(), providerType, messages, "")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println()
	for chunk := range ch {
		if chunk.Error != "" {
			fmt.Fprintf(os.Stderr, "Error: %s\n", chunk.Error)
			continue
		}
		if chunk.Content != "" {
			fmt.Print(chunk.Content)
		}
		if chunk.Done {
			fmt.Println()
		}
	}
}

func runExecSkill(cmd *cobra.Command, args []string) {
	role := skills.Role(args[0])
	skillName := args[1]
	prompt := args[2]

	// Find skill
	roleSkills := skills.GetSkillsForRole(role)
	var skill *skills.Skill
	for _, s := range roleSkills {
		if s.Name == skillName {
			skill = &s
			break
		}
	}

	if skill == nil {
		fmt.Fprintf(os.Stderr, "Skill not found: %s\n", skillName)
		os.Exit(1)
	}

	// Execute skill with tools
	aiCfg := getAIConfig()
	runner := tools.NewRunner(workDir)
	aiManager := ai.NewManager(aiCfg)

	systemPrompt := fmt.Sprintf("You are executing the skill '%s' for %s role. %s\n\nUse the available tools to complete the task.",
		skill.Name, role.String(), skill.Prompt)

	messages := []ai.Message{
		{Role: "user", Content: prompt},
	}

	providerType := ai.ProviderType(provider)
	ch, err := aiManager.SendMessage(context.Background(), providerType, messages, systemPrompt)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n[Executing %s skill for %s]\n\n", skillName, role.String())
	for chunk := range ch {
		if chunk.Error != "" {
			fmt.Fprintf(os.Stderr, "Error: %s\n", chunk.Error)
			continue
		}
		if chunk.Content != "" {
			fmt.Print(chunk.Content)
		}
		if chunk.Done {
			fmt.Println()
		}
	}

	// Execute tools if skill has tools
	if len(skill.Tools) > 0 {
		fmt.Printf("\n[Skill Tools: %s]\n", strings.Join(skill.Tools, ", "))
		for _, toolName := range skill.Tools {
			result := runner.Execute(toolName, map[string]interface{}{"path": "."})
			if result.Success {
				fmt.Printf("\n[%s result]\n%s\n", toolName, result.Content)
			}
		}
	}
}

func runMCPServer(cmd *cobra.Command, args []string) {
	ctx := context.Background()
	server := mcp.NewServer(port, workDir)

	if apiKey != "" {
		os.Setenv("OPENCODE_API_KEY", apiKey)
	}

	fmt.Printf("Starting MCP server on port %d...\n", port)
	fmt.Printf("Working directory: %s\n", workDir)
	fmt.Println("Available roles and skills will be exposed via MCP protocol")

	if err := server.Run(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "MCP server error: %v\n", err)
		os.Exit(1)
	}
}

func listSkills(cmd *cobra.Command, args []string) {
	if len(args) == 1 {
		role := skills.Role(args[0])
		roleSkills := skills.GetSkillsForRole(role)
		fmt.Printf("Skills for %s:\n", role.String())
		for _, s := range roleSkills {
			fmt.Printf("  • %s: %s\n", s.Name, s.Description)
		}
	} else {
		fmt.Println("All roles and skills:\n")
		for _, role := range []skills.Role{skills.RoleProduct, skills.RoleDesign, skills.RoleDevelop, skills.RoleTest, skills.RoleOps} {
			fmt.Printf("[%s]\n", role.String())
			roleSkills := skills.GetSkillsForRole(role)
			for _, s := range roleSkills {
				fmt.Printf("  • %s: %s\n", s.Name, s.Description)
			}
			fmt.Println()
		}
	}
}

func getAIConfig() *ai.Config {
	cfg := &ai.Config{
		Providers: make(map[ai.ProviderType]*ai.ProviderConfig),
		Default:   ai.ProviderType(provider),
	}

	// Override with command line options
	if apiKey == "" {
		apiKey = os.Getenv("OPENCODE_API_KEY")
	}

	modelName := model
	switch provider {
	case "claude":
		cfg.Providers[ai.ProviderAnthropic] = &ai.ProviderConfig{APIKey: apiKey, Model: modelName, MaxTokens: 8192, Temperature: 0.7}
	case "openai":
		cfg.Providers[ai.ProviderOpenAI] = &ai.ProviderConfig{APIKey: apiKey, Model: "gpt-4o", MaxTokens: 8192, Temperature: 0.7}
	case "gemini":
		cfg.Providers[ai.ProviderGemini] = &ai.ProviderConfig{APIKey: apiKey, Model: "gemini-2.0-flash", MaxTokens: 8192, Temperature: 0.7}
	case "claudecode":
		cfg.Providers[ai.ProviderClaudeCode] = &ai.ProviderConfig{APIKey: apiKey, Model: modelName, MaxTokens: 8192, Temperature: 0.7}
	}

	return cfg
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
