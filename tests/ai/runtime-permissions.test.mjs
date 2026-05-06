import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const permissionModePath = path.resolve(
  testDir,
  '../../src/modules/ai/runtime/approval/permissionMode.ts'
);
const riskPolicyPath = path.resolve(
  testDir,
  '../../src/modules/ai/runtime/approval/riskPolicy.ts'
);
const runAgentTurnPath = path.resolve(
  testDir,
  '../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts'
);
const modeSwitchPath = path.resolve(
  testDir,
  '../../src/components/ai/gn-agent-shell/GNAgentModeSwitch.tsx'
);
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');

const loadPermissionModule = async () => {
  const source = await readFile(permissionModePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(permissionModePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

const loadRiskPolicyModule = async () => {
  const source = await readFile(riskPolicyPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(riskPolicyPath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('plan sandbox does not auto approve low-risk writes', async () => {
  const { shouldAutoApproveRuntimeAction } = await loadRiskPolicyModule();

  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'low', sandboxPolicy: 'deny' }), false);
});

test('auto and bypass split medium-risk and high-risk approvals correctly', async () => {
  const { shouldAutoApproveRuntimeAction } = await loadRiskPolicyModule();

  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'medium', sandboxPolicy: 'ask' }), false);
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'medium', sandboxPolicy: 'allow' }), true);
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'medium', sandboxPolicy: 'bypass' }), true);
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'high', sandboxPolicy: 'allow' }), false);
  assert.equal(shouldAutoApproveRuntimeAction({ riskLevel: 'high', sandboxPolicy: 'bypass' }), true);
});

test('permission modes keep bypass distinct from auto', async () => {
  const { permissionModeToSandboxPolicy } = await loadPermissionModule();

  assert.equal(permissionModeToSandboxPolicy('auto'), 'allow');
  assert.notEqual(permissionModeToSandboxPolicy('bypass'), permissionModeToSandboxPolicy('auto'));
});

test('GN Agent shell exposes built-in modes only', async () => {
  const modeSwitchSource = await readFile(modeSwitchPath, 'utf8');

  assert.doesNotMatch(modeSwitchSource, /id:\s*'claude'/);
  assert.doesNotMatch(modeSwitchSource, /id:\s*'codex'/);
});

test('bypass mode requires an explicit confirmation path in chat UI', async () => {
  const chatSource = await readFile(chatPath, 'utf8');

  assert.match(chatSource, /confirmBypass|bypassConfirmation|setBypassConfirmation/);
  assert.match(chatSource, /value:\s*'bypass'/);
});

test('built-in runtime has enough tool rounds for inspect-edit-verify flows', async () => {
  const source = await readFile(runAgentTurnPath, 'utf8');
  const match = source.match(/maxRounds:\s*input\.maxRounds\s*\?\?\s*(\d+)/);

  assert.ok(match, 'runAgentTurn should set maxRounds with a default fallback');
  assert.ok(Number(match[1]) >= 50, 'default maxRounds should allow at least 50 rounds (matching cc-haha unlimited model-driven approach)');
});
