import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const toolsPath = path.resolve(__dirname, '../../src/modules/ai/runtime/tools/toolExecutor.ts');
const hostPlatformPath = path.resolve(__dirname, '../../src/utils/hostPlatform.ts');
const runtimeToolCatalogPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts',
);
const riskPolicyPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/approval/riskPolicy.ts',
);
const runtimeToolPolicyPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/tools/runtimeToolPolicy.ts',
);
const sidecarIndexPath = path.resolve(__dirname, '../../apps/runtime/src/index.ts');
const nodeExecutorPath = path.resolve(__dirname, '../../apps/runtime/src/nodeRuntimeToolExecutor.ts');

const toolUse = (name, input) => `<tool_use>
<tool name="${name}">
<tool_params>${JSON.stringify(input)}</tool_params>
</tool>
</tool_use>`;

test('workspace tool executor exposes a PowerShell tool on Windows and routes it through tool_bash', async () => {
  const toolSource = await readFile(toolsPath, 'utf8');

  assert.match(toolSource, /name:\s*'powershell'/);
  assert.match(toolSource, /case 'powershell':/);
  assert.match(toolSource, /shell:\s*'powershell'/);
});

test('Windows tool catalog exposes powershell but not bash to the model', async () => {
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  try {
    const { TOOLS } = await import(`../../src/modules/ai/runtime/tools/toolExecutor.ts?test=${Date.now()}`);
    const toolNames = TOOLS.map((tool) => tool.name);

    assert.ok(toolNames.includes('powershell'));
    assert.ok(!toolNames.includes('bash'));
  } finally {
    if (originalNavigator === undefined) {
      delete globalThis.navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  }
});

test('directory listing tool schema does not require a path when it defaults to project root', async () => {
  const { TOOLS } = await import(`../../src/modules/ai/runtime/tools/toolExecutor.ts?test=${Date.now()}`);
  const lsTool = TOOLS.find((tool) => tool.name === 'ls');

  assert.ok(lsTool);
  assert.deepEqual(lsTool.required || [], []);
});

test('workspace tool paths treat slash-prefixed paths as project-root relative without allowing traversal', async () => {
  const { ToolExecutor } = await import(`../../src/modules/ai/runtime/tools/toolExecutor.ts?test=${Date.now()}`);
  const executor = new ToolExecutor('C:\\repo\\app');

  assert.equal(executor.ensureProjectPath('/', 'directory'), 'C:/repo/app');
  assert.equal(executor.ensureProjectPath('/src', 'directory'), 'C:/repo/app/src');
  assert.equal(executor.ensureProjectPath('src/../package.json', 'file'), 'C:/repo/app/package.json');
  assert.throws(
    () => executor.ensureProjectPath('../outside.txt', 'file'),
    /Cannot access file outside the current project/,
  );
});

test('built-in approvals and risk policy treat powershell like a command tool', async () => {
  const [hostPlatformSource, runtimeToolCatalogSource, riskPolicySource, runtimeToolPolicySource] = await Promise.all([
    readFile(hostPlatformPath, 'utf8'),
    readFile(runtimeToolCatalogPath, 'utf8'),
    readFile(riskPolicyPath, 'utf8'),
    readFile(runtimeToolPolicyPath, 'utf8'),
  ]);

  assert.match(hostPlatformSource, /toolName === 'bash' \|\| toolName === 'powershell'/);
  assert.doesNotMatch(runtimeToolCatalogSource, /RISKY_BUILT_IN_TOOLS/);
  assert.match(runtimeToolPolicySource, /'write', 'edit', 'bash', 'powershell', 'fetch', 'agent'/);
  assert.match(riskPolicySource, /tool_powershell/);
});

test('Windows runtime prompt allows the model to call the powershell tool', async () => {
  const runAgentTurnModulePath = `../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts?test=${Date.now()}`;
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  try {
    const { runAgentTurn } = await import(runAgentTurnModulePath);
    const prompts = [];
    const executedCalls = [];
    const responses = [
      toolUse('powershell', { command: 'Get-Location' }),
      'Done.',
    ];

    const result = await runAgentTurn({
      projectId: 'project-1',
      projectName: 'GoodNight',
      threadId: 'thread-1',
      userInput: 'Check the current directory.',
      contextWindowTokens: 32000,
      conversationHistory: [],
      instructions: [],
      referenceFiles: [],
      memoryEntries: [],
      activeSkills: [],
      executeModel: async (prompt, systemPrompt) => {
        prompts.push({ prompt, systemPrompt });
        return responses.shift();
      },
      executeTool: async (call) => {
        executedCalls.push(call);
        return {
          type: 'text',
          content: 'C:/repo/demo',
        };
      },
    });

    assert.equal(result.finalContent, 'Done.');
    assert.equal(executedCalls.length, 1);
    assert.equal(executedCalls[0].name, 'powershell');
    assert.match(prompts[0].systemPrompt, /Available runtime tools: .*powershell/);
    assert.match(prompts[0].systemPrompt, /Prefer dedicated runtime tools such as glob, grep, ls, view, write, edit, fetch, and agent whenever they match the task/i);
    assert.match(prompts[0].systemPrompt, /For directory listing, file discovery, content search, and file reading, use ls, glob, grep, and view instead of shell commands/i);
    assert.match(prompts[0].systemPrompt, /If a tool call fails, read the error and switch to a more suitable tool or narrower input instead of repeating the same failing call/i);
    assert.match(prompts[0].systemPrompt, /When command execution is necessary on Windows, use the powershell tool rather than bash syntax/i);
    assert.doesNotMatch(prompts[0].systemPrompt, /bash tool remains available as a compatibility alias/i);
  } finally {
    if (originalNavigator === undefined) {
      delete globalThis.navigator;
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  }
});

test('node runtime sidecar treats powershell as a first-class command tool', async () => {
  const [sidecarSource, executorSource] = await Promise.all([
    readFile(sidecarIndexPath, 'utf8'),
    readFile(nodeExecutorPath, 'utf8'),
  ]);

  assert.match(sidecarSource, /buildApprovalSummary/);
  assert.match(sidecarSource, /getTurnAllowedRuntimeTools/);
  assert.match(executorSource, /case 'powershell'/);
  assert.doesNotMatch(executorSource, /execFile\('\/bin\/zsh'/);
});
