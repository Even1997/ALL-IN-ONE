import type { ProjectFileOperation } from '../../chat/projectFileOperations';
import type { ApprovalRiskLevel, SandboxPolicy } from './approvalTypes';

const HIGH_RISK_ACTIONS = new Set(['tool_remove', 'tool_bash', 'run_local_agent_prompt']);
const MEDIUM_RISK_ACTIONS = new Set(['tool_edit', 'tool_write', 'project_file_write']);
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
}) => riskLevel === 'low' || sandboxPolicy === 'allow';
