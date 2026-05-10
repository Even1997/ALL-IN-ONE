import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampDesktopAiPaneWidth,
  getDesktopAiPaneWidthFromPointer,
  isDesktopTopbarInteractiveTarget,
} from './desktopShell.ts';

test('clampDesktopAiPaneWidth keeps width inside bounds', () => {
  const bounds = { min: 280, max: 520 };

  assert.equal(clampDesktopAiPaneWidth(120, bounds), 280);
  assert.equal(clampDesktopAiPaneWidth(680, bounds), 520);
  assert.equal(clampDesktopAiPaneWidth(360, bounds), 360);
});

test('getDesktopAiPaneWidthFromPointer calculates width from drag delta', () => {
  assert.equal(
    getDesktopAiPaneWidthFromPointer({
      startWidth: 360,
      startPointerX: 1000,
      currentPointerX: 940,
      bounds: { min: 280, max: 520 },
    }),
    420
  );
});

test('getDesktopAiPaneWidthFromPointer clamps overshoot during resize drag', () => {
  assert.equal(
    getDesktopAiPaneWidthFromPointer({
      startWidth: 360,
      startPointerX: 1000,
      currentPointerX: 400,
      bounds: { min: 280, max: 520 },
    }),
    520
  );
});

test('isDesktopTopbarInteractiveTarget ignores controls and menus', () => {
  const interactiveTarget = {
    closest: (selector: string) => (selector.includes('button') ? { tagName: 'BUTTON' } : null),
  };
  const neutralTarget = {
    closest: () => null,
  };

  assert.equal(isDesktopTopbarInteractiveTarget(interactiveTarget), true);
  assert.equal(isDesktopTopbarInteractiveTarget(neutralTarget), false);
  assert.equal(isDesktopTopbarInteractiveTarget(null), false);
});
