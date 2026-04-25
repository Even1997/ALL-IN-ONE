import assert from 'node:assert/strict';
import test from 'node:test';

import { VISIBLE_ROLE_TABS } from '../src/appNavigation.ts';

test('visible role tabs hide development pages for now', () => {
  assert.deepEqual(
    VISIBLE_ROLE_TABS.map((tab) => tab.id),
    ['product', 'design']
  );
});
