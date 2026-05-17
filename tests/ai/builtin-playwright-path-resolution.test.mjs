import assert from 'node:assert/strict';
import test from 'node:test';

const loadResolver = async () =>
  import(`../../scripts/lib/builtinPlaywrightResolver.mjs?test=${Date.now()}`);

test('builtin playwright resolver prefers node_modules roots that include playwright-core', async () => {
  const { pickPreferredNodeModulesRoot } = await loadResolver();

  const selected = pickPreferredNodeModulesRoot([
    'C:\\runtime\\node_modules',
    'C:\\runtime\\node_modules\\.pnpm\\playwright@1.59.1\\node_modules',
    'C:\\workspace\\node_modules',
  ], {
    exists: (targetPath) =>
      new Set([
        'C:\\runtime\\node_modules\\playwright',
        'C:\\runtime\\node_modules\\.pnpm\\playwright@1.59.1\\node_modules\\playwright',
        'C:\\runtime\\node_modules\\.pnpm\\playwright@1.59.1\\node_modules\\playwright-core',
      ]).has(targetPath),
  });

  assert.equal(selected, 'C:\\runtime\\node_modules\\.pnpm\\playwright@1.59.1\\node_modules');
});

test('builtin playwright resolver falls back to playwright-only roots when no complete root exists', async () => {
  const { pickPreferredNodeModulesRoot } = await loadResolver();

  const selected = pickPreferredNodeModulesRoot(['C:\\runtime\\node_modules'], {
    exists: (targetPath) => targetPath === 'C:\\runtime\\node_modules\\playwright',
  });

  assert.equal(selected, 'C:\\runtime\\node_modules');
});

test('builtin playwright resolver returns null when no candidate contains playwright', async () => {
  const { pickPreferredNodeModulesRoot } = await loadResolver();

  const selected = pickPreferredNodeModulesRoot(['C:\\runtime\\node_modules'], {
    exists: () => false,
  });

  assert.equal(selected, null);
});
