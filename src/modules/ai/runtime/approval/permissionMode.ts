// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
