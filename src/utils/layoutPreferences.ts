// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export type LayoutSizeBounds = {
  min: number;
  max: number;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const LAYOUT_PREFERENCE_KEYS = {
  agentWorkbenchSidebarWidth: 'layout.agentWorkbench.sidebarWidth',
  productWorkbenchLeftNavWidth: 'layout.productWorkbench.leftNavWidth',
  workspaceSidebarWidth: 'layout.workspace.sidebarWidth',
  workspaceActivityWidth: 'layout.workspace.activityWidth',
  workspaceTerminalHeight: 'layout.workspace.terminalHeight',
  desktopAiPaneWidth: 'layout.desktop.aiPaneWidth',
} as const;

export const clampLayoutSize = (value: number, bounds: LayoutSizeBounds) =>
  Math.min(bounds.max, Math.max(bounds.min, value));

const getDefaultStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const readLayoutSize = (
  key: string,
  fallback: number,
  bounds: LayoutSizeBounds,
  storage: StorageLike | null = getDefaultStorage()
) => {
  if (!storage) {
    return clampLayoutSize(fallback, bounds);
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return clampLayoutSize(fallback, bounds);
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return clampLayoutSize(fallback, bounds);
    }

    return clampLayoutSize(parsed, bounds);
  } catch {
    return clampLayoutSize(fallback, bounds);
  }
};

export const writeLayoutSize = (
  key: string,
  value: number,
  bounds: LayoutSizeBounds,
  storage: StorageLike | null = getDefaultStorage()
) => {
  const nextValue = clampLayoutSize(value, bounds);
  if (!storage) {
    return nextValue;
  }

  try {
    storage.setItem(key, String(nextValue));
  } catch {
    return nextValue;
  }

  return nextValue;
};
