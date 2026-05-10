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
