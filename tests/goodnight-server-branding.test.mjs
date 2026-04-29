import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('goodnight server oauth pages no longer expose Atomic branding', async () => {
  const source = await readFile(new URL('../crates/goodnight-server/src/routes/oauth.rs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /Authorize .*Atomic/);
  assert.doesNotMatch(source, /Atomic knowledge base/);
  assert.doesNotMatch(source, /Create a new Atomic API token/);
  assert.match(source, /GoodNight knowledge base/);
});
