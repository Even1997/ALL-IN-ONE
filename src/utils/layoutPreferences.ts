export type LayoutSizeBounds = {
  min: number;
  max: number;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const LAYOUT_PREFERENCE_KEYS = {
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
