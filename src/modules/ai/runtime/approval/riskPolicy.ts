// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ProjectFileOperation } from '../../chat/projectFileOperations';
import type { ApprovalRiskLevel, SandboxPolicy } from './approvalTypes';

const HIGH_RISK_ACTIONS = new Set([
  'tool_remove',
  'tool_bash',
  'tool_powershell',
  'tool_fetch',
  'tool_agent',
  'run_local_agent_prompt',
]);
const MEDIUM_RISK_ACTIONS = new Set(['tool_edit', 'tool_write', 'project_file_write', 'mcp_tool_call']);
const HIGH_RISK_PATH_PATTERNS = [
  /^\.env/i,
  /^package(-lock)?\.json$/i,
  /^pnpm-lock\.ya?ml$/i,
  /^yarn\.lock$/i,
  /^bun\.lockb$/i,
  /^src-tauri\//i,
  /^\.github\//i,
  /^scripts\//i,
];

const normalizeTargetPath = (targetPath: string) =>
  targetPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();

const isHighRiskTargetPath = (targetPath: string) => {
  const normalized = normalizeTargetPath(targetPath);
  return HIGH_RISK_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const classifyRuntimeActionRisk = (actionType: string): ApprovalRiskLevel => {
  if (HIGH_RISK_ACTIONS.has(actionType)) {
    return 'high';
  }

  if (MEDIUM_RISK_ACTIONS.has(actionType)) {
    return 'medium';
  }

  return 'low';
};

export const classifyProjectFileOperationsRisk = (
  operations: Array<Pick<ProjectFileOperation, 'type' | 'targetPath'>>,
): ApprovalRiskLevel => {
  if (operations.some((operation) => operation.type === 'delete_file')) {
    return 'high';
  }

  if (operations.some((operation) => isHighRiskTargetPath(operation.targetPath))) {
    return 'high';
  }

  if (
    operations.length > 3 ||
    operations.some((operation) => operation.type === 'edit_file')
  ) {
    return 'medium';
  }

  return 'low';
};

export const shouldDenyRuntimeAction = ({
  riskLevel,
  sandboxPolicy,
}: {
  riskLevel: ApprovalRiskLevel;
  sandboxPolicy: SandboxPolicy;
}) => sandboxPolicy === 'deny' && riskLevel !== 'low';

export const shouldAutoApproveRuntimeAction = ({
  riskLevel,
  sandboxPolicy,
}: {
  riskLevel: ApprovalRiskLevel;
  sandboxPolicy: SandboxPolicy;
}) => {
  if (sandboxPolicy === 'deny') {
    return false;
  }

  if (sandboxPolicy === 'bypass') {
    return true;
  }

  if (sandboxPolicy === 'allow') {
    return riskLevel !== 'high';
  }

  return riskLevel === 'low';
};
