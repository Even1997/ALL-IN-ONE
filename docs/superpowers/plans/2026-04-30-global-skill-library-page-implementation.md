# Global Skill Library Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将技能管理迁移到 GN Agent 的全局 `Skills` 页面，并让聊天页只保留普通聊天与 `@skill` 使用方式。

**Architecture:** 沿用现有 GN Agent shell 作为二级页面容器，在其中新增 `skills` 模式和独立页面。后端继续以 GoodNight 全局 skill library 为真源，补齐 Claude 本地发现、删除命令和页面所需元数据。

---

## File Structure

### 前端壳层与页面

- Modify: `src/modules/ai/gn-agent/types.ts`
- Modify: `src/modules/ai/gn-agent/gnAgentShellStore.ts`
- Modify: `src/components/ai/gn-agent-shell/GNAgentModeSwitch.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentShell.tsx`
- Create: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentShell.css`

### 前端技能模块

- Modify: `src/modules/ai/skills/skillLibrary.ts`

### 聊天页

- Modify: `src/components/workspace/AIChat.tsx`

### 后端

- Modify: `src-tauri/src/lib.rs`

### 测试

- Modify: `tests/ai/ai-chat-skills-and-activity-ui.test.mjs`
- Modify: `tests/ai/gn-agent-shell-components.test.mjs`
- Modify: `tests/ai/gn-agent-shell-state.test.mjs`
- Modify: `tests/ai/skill-library-source.test.mjs`
- Create: `tests/ai/gn-agent-skills-page.test.mjs`

## Task 1: 锁定聊天页去技能面板后的 UI 断言

**Files:**
- Modify: `tests/ai/ai-chat-skills-and-activity-ui.test.mjs`
- Modify: `src/components/workspace/AIChat.tsx`

- [ ] **Step 1: 写失败测试**

让测试断言：

- `AgentLaneId` 不再包含 `skills`
- `GN_AGENT_LANES` 保留 `Chat / Tasks / Artifacts / Context / Activity`
- 页面仍包含 `@skill`
- 页面不再包含 `chat-agent-skills-panel`

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs`

Expected: FAIL，因为当前聊天页还保留技能 lane。

- [ ] **Step 3: 最小实现**

从 `src/components/workspace/AIChat.tsx` 删除：

- `skills` lane 类型
- `GN_AGENT_LANES` 中的 `Skills`
- `activeAgentLane === 'skills'` 的整段渲染分支

保留：

- `resolveSkillIntent`
- `GN_AGENT_SUGGESTIONS`
- `@skill` 提示

- [ ] **Step 4: 重新运行测试确认 GREEN**

Run: `node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs`

Expected: PASS

## Task 2: 锁定 GN Agent shell 的新 Skills 模式

**Files:**
- Modify: `tests/ai/gn-agent-shell-state.test.mjs`
- Modify: `tests/ai/gn-agent-shell-components.test.mjs`
- Modify: `src/modules/ai/gn-agent/types.ts`
- Modify: `src/modules/ai/gn-agent/gnAgentShellStore.ts`
- Modify: `src/components/ai/gn-agent-shell/GNAgentModeSwitch.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentShell.tsx`

- [ ] **Step 1: 写失败测试**

新增断言：

- `GNAgentShellMode` 包含 `'skills'`
- `GNAgentShell` 包含 `currentMode === 'skills'`
- mode switch 中包含 `Skills`

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test tests/ai/gn-agent-shell-state.test.mjs tests/ai/gn-agent-shell-components.test.mjs`

Expected: FAIL，因为当前没有 `skills` 模式。

- [ ] **Step 3: 最小实现**

修改上述前端壳层文件：

- 在 mode union 中加入 `'skills'`
- mode switch 增加 `Skills` 按钮
- shell 标题与内容路由增加 `skills`

- [ ] **Step 4: 重新运行测试确认 GREEN**

Run: `node --test tests/ai/gn-agent-shell-state.test.mjs tests/ai/gn-agent-shell-components.test.mjs`

Expected: PASS

## Task 3: 锁定独立 Skills 页面结构

**Files:**
- Create: `tests/ai/gn-agent-skills-page.test.mjs`
- Create: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentShell.css`
- Modify: `src/modules/ai/skills/skillLibrary.ts`

- [ ] **Step 1: 写失败测试**

测试至少断言新页面源码包含：

- `discoverLocalSkills`
- `importLocalSkill`
- `importGitHubSkill`
- `syncSkillToRuntime`
- `Built-in`
- `Delete`
- `Sync to Codex`
- `Sync to Claude`

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test tests/ai/gn-agent-skills-page.test.mjs`

Expected: FAIL，因为页面还不存在。

- [ ] **Step 3: 最小实现**

新建 `GNAgentSkillsPage.tsx`：

- 进入页面时拉取技能列表
- 渲染技能卡片
- 为内置技能显示 `Built-in`
- 对 `deletable === true` 的条目显示 `Delete`
- 提供本地导入、GitHub 导入、同步按钮

同时在 `skillLibrary.ts` 中补充：

- `builtin`
- `deletable`
- `deleteLibrarySkill`

并在 `GNAgentShell.css` 中补充页面样式。

- [ ] **Step 4: 重新运行测试确认 GREEN**

Run: `node --test tests/ai/gn-agent-skills-page.test.mjs`

Expected: PASS

## Task 4: 锁定后端 skill discovery 和删除命令

**Files:**
- Modify: `tests/ai/skill-library-source.test.mjs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 写失败测试**

新增断言：

- `SkillDiscoveryEntry` 里有 `builtin`
- `SkillDiscoveryEntry` 里有 `deletable`
- 存在 `fn delete_library_skill`
- `collect_skill_discovery_entries` 包含 Claude 本地发现
- `tauri::generate_handler!` 注册 `delete_library_skill`

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test tests/ai/skill-library-source.test.mjs`

Expected: FAIL，因为当前还没有删除命令和 Claude 本地发现条目。

- [ ] **Step 3: 最小实现**

在 `src-tauri/src/lib.rs` 中：

- 扩展 `SkillDiscoveryEntry`
- 在 discovery 中加入 Claude 本地目录扫描
- 增加 `delete_library_skill`
- 只允许删除 GoodNight imported 中的非内置技能
- 注册新命令

- [ ] **Step 4: 重新运行测试确认 GREEN**

Run: `node --test tests/ai/skill-library-source.test.mjs`

Expected: PASS

## Task 5: 运行组合验证

**Files:**
- Modify: 上述所有文件

- [ ] **Step 1: 运行目标测试**

Run: `node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs tests/ai/gn-agent-shell-state.test.mjs tests/ai/gn-agent-shell-components.test.mjs tests/ai/gn-agent-skills-page.test.mjs tests/ai/skill-library-source.test.mjs`

Expected: PASS

- [ ] **Step 2: 运行构建**

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: 如有必要做最小修正并重跑**

只修本次 feature 直接相关的问题，不顺手改别的模块。
