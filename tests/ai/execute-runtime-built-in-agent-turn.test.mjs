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
const loadBuiltInTurn = async () =>
  import(`../../src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts?test=${Date.now()}`);

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

  const guardedNoToolEvidence = guardUnverifiedFileMutationClaims({
    content: '已保存到 需求文档审查意见.md。',
    toolCalls: [],
  });
  assert.doesNotMatch(guardedNoToolEvidence, /已保存到/);
  assert.match(guardedNoToolEvidence, /不能确认|还没有拿到/i);

  const guardedUnverifiedEvidence = guardUnverifiedFileMutationClaims({
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
  });
  assert.doesNotMatch(guardedUnverifiedEvidence, /已保存到/);
  assert.match(guardedUnverifiedEvidence, /不能确认|还没有拿到/i);

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

test('file mutation guard preserves substantive artifact content when save claims are unverified', async () => {
  const { guardUnverifiedFileMutationClaims } = await loadFileMutationClaimGuard();

  const guarded = guardUnverifiedFileMutationClaims({
    content: [
      '# Anime App Requirements',
      '',
      '## Goals',
      '- Help users discover seasonal shows.',
      '- Track watch progress across devices.',
      '',
      'Saved to docs/anime-app-requirements.md.',
    ].join('\n'),
    toolCalls: [],
  });

  assert.match(guarded, /# Anime App Requirements/);
  assert.match(guarded, /## Goals/);
  assert.doesNotMatch(guarded, /Saved to docs\/anime-app-requirements\.md\./);
  assert.match(guarded, /未确认|文件变更结果/);
});

test('built-in runtime asks for the actual artifact body when tool inspection ends with process-only narration', async () => {
  const { executeRuntimeBuiltInAgentTurn } = await loadBuiltInTurn();

  let callCount = 0;
  const result = await executeRuntimeBuiltInAgentTurn({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    projectRoot: 'C:/repo/demo',
    userInput: '写一个需求文档关于动漫app的',
    rawUserInput: '写一个需求文档关于动漫app的',
    conversationHistory: [],
    agentInstructions: [],
    referenceFiles: [],
    memoryEntries: [],
    activeSkills: [],
    skillIntent: null,
    contextLabels: [],
    allowedTools: ['view'],
    executeModel: async (prompt) => {
      callCount += 1;
      if (callCount === 1) {
        return '<tool_use>\n<tool name="view">\n<tool_params>{"file_path":"docs/动漫APP需求文档.md","limit":60}</tool_params>\n</tool>\n</tool_use>';
      }
      if (callCount === 2) {
        return '好的，我看到项目里已经有一份初版需求文档。现在我来把它扩展为一份结构完整的真正产品需求文档。';
      }
      assert.match(prompt, /Output the full artifact body now/i);
      return '# 动漫 APP 需求文档\n\n## 1. 产品定位\n\n面向动漫用户的内容社区。';
    },
    executeTool: async () => ({
      type: 'text',
      content: '# 动漫 APP 需求文档\n\n初版内容',
    }),
  });

  assert.equal(callCount, 3);
  assert.match(result.finalContent, /# 动漫 APP 需求文档/);
});
