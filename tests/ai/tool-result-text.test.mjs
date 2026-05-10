import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TOOLS,
  buildVerifiedFileChange,
  resolveEditStrings,
  resolveRustToolResultText,
  resolveViewFilePathParam,
  resolveWriteFilePathParam,
  verifyEditFileMutation,
  verifyWriteFileMutation,
  shouldCaptureFileChangeSnapshot,
} from '../../src/components/workspace/tools.ts';
import { getBuiltInRuntimeToolNames } from '../../src/modules/ai/runtime/tools/runtimeToolPolicy.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const toolsPath = path.resolve(testDir, '../../src/modules/ai/runtime/tools/toolExecutor.ts');

test('write and edit tools tell the model not to mutate files from save-like questions', async () => {
  const source = await readFile(toolsPath, 'utf8');

  assert.match(source, /Use only when the user asked to create, save, or fully rewrite a concrete file\./);
  assert.match(source, /For existing files, read the file first with view before writing\./);
  assert.match(source, /Never create documentation files \(\*\.md\) or README files unless explicitly requested by the user\./);
  assert.match(source, /Do not use this tool to answer questions about saving problems/);
  assert.match(source, /Do not use this tool merely because the user mentioned "save" or "保存" in a question\./);
});

test('runtime tool catalog exposes the built-in multi-agent delegation tool', async () => {
  const source = await readFile(toolsPath, 'utf8');
  const agentTool = TOOLS.find((tool) => tool.name === 'agent');

  assert.ok(agentTool, 'expected an agent tool definition');
  assert.ok(getBuiltInRuntimeToolNames(false).includes('agent'));
  assert.match(source, /name:\s*'agent'/);
  assert.match(source, /multi-agent/i);
});

test('resolveRustToolResultText preserves successful tool content', () => {
  assert.equal(
    resolveRustToolResultText({
      success: true,
      content: '<file>\n     1|hello\n</file>',
      error: null,
    }),
    '<file>\n     1|hello\n</file>',
  );
});

test('resolveRustToolResultText surfaces backend tool errors instead of blank content', () => {
  assert.equal(
    resolveRustToolResultText({
      success: false,
      content: '',
      error: 'File not found: docs/prd.md',
    }),
    'File not found: docs/prd.md',
  );
});

test('resolveViewFilePathParam accepts common model path aliases', () => {
  assert.equal(resolveViewFilePathParam({ file_path: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveViewFilePathParam({ filePath: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveViewFilePathParam({ path: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveViewFilePathParam({ target: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveViewFilePathParam({ file: 'docs/prd.md' }), 'docs/prd.md');
});

test('resolveViewFilePathParam rejects missing paths instead of falling back to project root', () => {
  assert.equal(resolveViewFilePathParam({}), null);
  assert.equal(resolveViewFilePathParam({ path: '   ' }), null);
});

test('resolveWriteFilePathParam accepts common model path aliases', () => {
  assert.equal(resolveWriteFilePathParam({ file_path: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveWriteFilePathParam({ filePath: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveWriteFilePathParam({ path: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveWriteFilePathParam({ target: 'docs/prd.md' }), 'docs/prd.md');
  assert.equal(resolveWriteFilePathParam({ file: 'docs/prd.md' }), 'docs/prd.md');
});

test('resolveWriteFilePathParam rejects missing paths', () => {
  assert.equal(resolveWriteFilePathParam({}), null);
  assert.equal(resolveWriteFilePathParam({ file: '   ' }), null);
});

test('resolveEditStrings accepts canonical and model-friendly edit aliases', () => {
  assert.deepEqual(
    resolveEditStrings({
      old_string: 'Beta',
      new_string: 'Gamma',
    }),
    {
      oldString: 'Beta',
      newString: 'Gamma',
    }
  );

  assert.deepEqual(
    resolveEditStrings({
      pattern: 'Beta',
      replacement: 'Gamma',
    }),
    {
      oldString: 'Beta',
      newString: 'Gamma',
    }
  );

  assert.deepEqual(
    resolveEditStrings({
      pattern: 'Beta',
      replace: 'Gamma',
    }),
    {
      oldString: 'Beta',
      newString: 'Gamma',
    }
  );

  assert.deepEqual(
    resolveEditStrings({
      oldString: 'Beta',
      newString: 'Gamma',
    }),
    {
      oldString: 'Beta',
      newString: 'Gamma',
    }
  );
});

test('resolveEditStrings rejects incomplete edit arguments', () => {
  assert.equal(resolveEditStrings({ pattern: 'Beta' }), null);
  assert.equal(resolveEditStrings({ replace: 'Gamma' }), null);
  assert.equal(resolveEditStrings({ old_string: 'Beta' }), null);
});

test('shouldCaptureFileChangeSnapshot skips markdown documents and oversized content snapshots', () => {
  assert.equal(shouldCaptureFileChangeSnapshot('docs/prd.md', 4000), false);
  assert.equal(shouldCaptureFileChangeSnapshot('docs/notes.txt', 4000), false);
  assert.equal(shouldCaptureFileChangeSnapshot('src/App.tsx', 20000), false);
  assert.equal(shouldCaptureFileChangeSnapshot('src/App.tsx', 4000), true);
});

test('file mutation evidence marks verified write changes without storing skipped snapshots', async () => {
  const verified = await verifyWriteFileMutation({
    filePath: 'docs/prd.md',
    expectedContent: '# PRD',
    readTextFile: async () => '# PRD',
  });

  assert.equal(verified, true);
  assert.deepEqual(
    buildVerifiedFileChange({
      path: 'docs/prd.md',
      operation: 'write',
      beforeContent: null,
      afterContent: null,
    }),
    {
      path: 'docs/prd.md',
      operation: 'write',
      beforeContent: null,
      afterContent: null,
      verified: true,
    }
  );
});

test('file mutation evidence rejects write and edit results that cannot be read back', async () => {
  assert.equal(
    await verifyWriteFileMutation({
      filePath: 'docs/prd.md',
      expectedContent: '# PRD',
      readTextFile: async () => '# Other',
    }),
    false
  );

  assert.equal(
    await verifyEditFileMutation({
      filePath: 'src/app.ts',
      beforeContent: 'const a = 1;',
      newString: 'const a = 2;',
      readTextFile: async () => 'const a = 1;',
    }),
    false
  );
});
