import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const executionPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts'
);
const agentKernelPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts'
);
const loadFileMutationClaimGuard = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeFileMutationClaimGuard.ts?test=${Date.now()}`);

test('built-in runtime has a direct-answer fallback for project access failures', async () => {
  const source = await readFile(executionPath, 'utf8');

  assert.match(source, /TOOL_LOOP_EXHAUSTED_PATTERN/);
  assert.match(source, /PROJECT_ACCESS_FAILURE_PATTERNS/);
  assert.match(source, /findProjectAccessFailure/);
  assert.match(source, /shouldRetryWithoutProjectTools/);
  assert.match(source, /Project inspection failed:/);
  assert.match(source, /Do not call any more tools\./);
  assert.match(source, /best-effort answer/);
  assert.match(source, /input\.executeModel\(/);
});

test('agent kernel prompt prefers direct drafting when project files are unnecessary', async () => {
  const source = await readFile(agentKernelPath, 'utf8');

  assert.match(
    source,
    /For straightforward writing, drafting, brainstorming, or requirements\/spec requests that do not depend on project files, answer directly without calling tools first\./
  );
});

test('built-in runtime downgrades file mutation success claims without verified tool results', async () => {
  const { guardUnverifiedFileMutationClaims } = await loadFileMutationClaimGuard();

  assert.equal(
    guardUnverifiedFileMutationClaims({
      content: '已保存到 需求文档审查意见.md。',
      toolCalls: [],
    }),
    '我还没有拿到成功的项目文件变更结果，因此不能确认已保存、已修改或已删除。请明确目标文件后我会通过文件变更流程执行。'
  );

  assert.equal(
    guardUnverifiedFileMutationClaims({
      content: '已保存到 需求文档审查意见.md。',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'write',
          input: { file_path: '需求文档审查意见.md', content: 'ok' },
          status: 'completed',
          resultPreview: 'ok',
          resultContent: 'ok',
          fileChanges: [{ path: '需求文档审查意见.md', beforeContent: null, afterContent: null }],
        },
      ],
    }),
    '我还没有拿到成功的项目文件变更结果，因此不能确认已保存、已修改或已删除。请明确目标文件后我会通过文件变更流程执行。'
  );

  assert.equal(
    guardUnverifiedFileMutationClaims({
      content: '已保存到 需求文档审查意见.md。',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'write',
          input: { file_path: '需求文档审查意见.md', content: 'ok' },
          status: 'completed',
          resultPreview: 'ok',
          resultContent: 'ok',
          fileChanges: [{ path: '需求文档审查意见.md', beforeContent: null, afterContent: null, verified: true }],
        },
      ],
    }),
    '已保存到 需求文档审查意见.md。'
  );
});
