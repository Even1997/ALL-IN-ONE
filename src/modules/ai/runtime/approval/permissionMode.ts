import type { PermissionMode, SandboxPolicy } from './approvalTypes';

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  ask: '默认权限',
  plan: '规划优先',
  auto: '自动执行',
  bypass: '完全放行',
};

export const sandboxPolicyToPermissionMode = (policy: SandboxPolicy): PermissionMode => {
  if (policy === 'deny') {
    return 'plan';
  }

  if (policy === 'allow') {
    return 'auto';
  }

  if (policy === 'bypass') {
    return 'bypass';
  }

  return 'ask';
};

export const permissionModeToSandboxPolicy = (mode: PermissionMode): SandboxPolicy => {
  if (mode === 'plan') {
    return 'deny';
  }

  if (mode === 'auto') {
    return 'allow';
  }

  if (mode === 'bypass') {
    return 'bypass';
  }

  return 'ask';
};
