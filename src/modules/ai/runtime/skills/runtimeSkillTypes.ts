// 文件作用：类型契约文件，位于runtime 技能层。
// 所在链路：负责 skill 注册、类型约束和 prompt 注入结构。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这是 runtime 侧对“技能”最核心的结构定义。
// skillLibrary 会把 SKILL.md 解析成这些字段，后续 prompt 组装、技能路由、hook 执行都依赖这里。
// 这个文件定义 runtime 对技能系统使用的标准结构，是技能运行时的核心类型层。
// 从 SKILL.md 解析出的结果、hook 配置、prompt 组装和技能注册都会统一落到这些类型上。
// 如果你在排查“技能为什么没被识别 / hook 没触发 / prompt 里缺内容”，先看这里的字段定义是否满足需求。
export type RuntimeSkillShell = 'bash' | 'powershell';

// hook step 代表一次实际要执行的命令。
export type RuntimeSkillHookStep = {
  command: string;
  once?: boolean;
};

// matcher 把“什么时候触发”与“触发时执行哪些 hook step”绑定在一起。
export type RuntimeSkillHookMatcher = {
  matcher: string;
  hooks: RuntimeSkillHookStep[];
};

export type RuntimeSkillHooks = Partial<
  Record<'PreToolUse' | 'PostToolUse', RuntimeSkillHookMatcher[]>
>;

// RuntimeSkillDefinition 是前端 runtime 使用技能时的标准形态。
// 可以把它理解成“从 SKILL.md 提炼出的执行合同”。
export type RuntimeSkillDefinition = {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  version?: string;
  prompt: string;
  token?: string;
  aliases?: string[];
  executionContext: 'inline' | 'fork';
  argumentHint?: string;
  argumentNames?: string[];
  agent?: string;
  model?: string;
  effort?: string;
  shell?: RuntimeSkillShell;
  hooks?: RuntimeSkillHooks;
  activationPaths?: string[];
  skillRoot?: string;
  allowedTools: string[];
  userInvocable: boolean;
  userTagInvocable?: boolean;
  modelInvocable: boolean;
  source: 'system' | 'local' | 'project' | 'plugin' | 'mcp';
};
