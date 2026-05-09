import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const libPath = path.resolve(repoRoot, 'src-tauri/src/lib.rs');
const toolExecutorPath = path.resolve(repoRoot, 'src/modules/ai/runtime/tools/toolExecutor.ts');

test('Tauri tool params carry project_root for backend boundary checks', async () => {
  const libSource = await readFile(libPath, 'utf8');

  for (const structName of ['ViewParams', 'WriteParams', 'EditParams', 'BashParams', 'RemoveParams']) {
    const structMatch = libSource.match(new RegExp(`pub struct ${structName} \\{[\\s\\S]*?\\n\\}`));
    assert.ok(structMatch, `${structName} should exist`);
    assert.match(structMatch[0], /project_root:\s*Option<String>/, `${structName} should carry project_root`);
  }

  assert.match(libSource, /ensure_project_path/);
  assert.match(libSource, /outside the current project/);
});

test('built-in tool invocations pass projectRoot into Tauri tools', async () => {
  const toolExecutorSource = await readFile(toolExecutorPath, 'utf8');

  assert.match(toolExecutorSource, /project_root:\s*this\.projectRoot/);
});

test('Tauri bash tool enforces timeout by spawning and killing long-running commands', async () => {
  const libSource = await readFile(libPath, 'utf8');
  const bashMatch = libSource.match(/fn tool_bash\(params: BashParams\) -> ToolResult \{[\s\S]*?\n\}/);

  assert.ok(bashMatch, 'tool_bash should exist');
  assert.match(libSource, /run_command_with_timeout/);
  assert.match(libSource, /try_wait\(\)/);
  assert.match(libSource, /\.kill\(\)/);
  assert.doesNotMatch(bashMatch[0], /process\.output\(\)/);
});

test('Tauri Windows shell path prefers pwsh and keeps write access diagnostics readable', async () => {
  const libSource = await readFile(libPath, 'utf8');

  assert.match(libSource, /Command::new\("pwsh"\)/);
  assert.match(libSource, /ErrorKind::NotFound/);
  assert.match(libSource, /decode_command_output/);
  assert.match(libSource, /Access denied for/);
  assert.match(libSource, /inside the current project, but Windows blocked the write/);
});
