// 文件作用：工作台壳组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export type DesktopPaneBounds = {
  min: number;
  max: number;
};

type ClosestCapableTarget = {
  closest?: (selector: string) => unknown;
};

const DESKTOP_TOPBAR_INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, [role="menu"], [role="menuitem"], [data-app-menu-root="desktop"], .mac-field, .mac-select-shell, .desktop-window-controls';

export const clampDesktopAiPaneWidth = (value: number, bounds: DesktopPaneBounds): number =>
  Math.min(bounds.max, Math.max(bounds.min, value));

export const getDesktopAiPaneWidthFromPointer = ({
  startWidth,
  startPointerX,
  currentPointerX,
  bounds,
}: {
  startWidth: number;
  startPointerX: number;
  currentPointerX: number;
  bounds: DesktopPaneBounds;
}): number => clampDesktopAiPaneWidth(startWidth + startPointerX - currentPointerX, bounds);

export const isDesktopTopbarInteractiveTarget = (target: EventTarget | ClosestCapableTarget | null): boolean => {
  if (!target || typeof target !== 'object' || !('closest' in target) || typeof target.closest !== 'function') {
    return false;
  }

  return Boolean(target.closest(DESKTOP_TOPBAR_INTERACTIVE_SELECTOR));
};
