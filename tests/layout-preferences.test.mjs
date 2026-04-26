import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampLayoutSize,
  readLayoutSize,
  writeLayoutSize,
} from '../src/utils/layoutPreferences.ts';

test('layout preference helpers clamp and persist numeric pane sizes', () => {
  const store = new Map();
  const storage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };

  assert.equal(readLayoutSize('layout.test.width', 280, { min: 200, max: 420 }, storage), 280);

  writeLayoutSize('layout.test.width', 999, { min: 200, max: 420 }, storage);
  assert.equal(store.get('layout.test.width'), '420');

  store.set('layout.test.width', '120');
  assert.equal(readLayoutSize('layout.test.width', 280, { min: 200, max: 420 }, storage), 200);

  store.set('layout.test.width', 'abc');
  assert.equal(readLayoutSize('layout.test.width', 280, { min: 200, max: 420 }, storage), 280);

  assert.equal(clampLayoutSize(120, { min: 200, max: 420 }), 200);
  assert.equal(clampLayoutSize(560, { min: 200, max: 420 }), 420);
});
