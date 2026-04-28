import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('goodnight mcp bridge no longer points at atomic runtime names', async () => {
  const source = await readFile(new URL('../crates/goodnight-mcp-bridge/src/main.rs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /Atomic MCP Bridge/);
  assert.doesNotMatch(source, /ATOMIC_TOKEN|ATOMIC_PORT|ATOMIC_HOST/);
  assert.doesNotMatch(source, /com\.atomic\.app/);
  assert.match(source, /GOODNIGHT_TOKEN|GOODNIGHT_PORT|GOODNIGHT_HOST/);
  assert.match(source, /goodnight_local_server_token/);
});
