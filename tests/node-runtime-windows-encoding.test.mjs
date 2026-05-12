import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('node runtime powershell tool decodes GBK console output into readable Chinese', async () => {
  const moduleUrl = pathToFileURL(path.resolve('apps/runtime/src/nodeRuntimeToolExecutor.ts')).href;
  const { NodeRuntimeToolExecutor } = await import(moduleUrl);
  const executor = new NodeRuntimeToolExecutor(process.cwd());
  const command = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::GetEncoding(936)',
    '$bytes = [System.Text.Encoding]::GetEncoding(936).GetBytes(([char]0x4E2D).ToString() + ([char]0x6587).ToString())',
    '[Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)',
  ].join('; ');

  const result = await executor.execute({
    name: 'powershell',
    input: { command },
  });

  assert.equal(result.type, 'text');
  assert.equal(result.is_error, undefined);
  assert.match(result.content, /中文/);
  assert.doesNotMatch(result.content, /\?{2,}|�{2,}/);
});
