import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeTypesPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeTypes.ts');
const bridgeTypesPath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/types.ts');

function parseSourceFile(filePath, source) {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function getTypeAlias(sourceFile, name) {
  return sourceFile.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === name,
  );
}

function getPropertyTypeNode(typeLiteral, propertyName) {
  const member = typeLiteral.members.find(
    (candidate) =>
      ts.isPropertySignature(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.name.text === propertyName,
  );
  return member?.type ?? null;
}

test('agent runtime types define shared provider ids and runtime records', async () => {
  const source = await readFile(runtimeTypesPath, 'utf8');
  const sourceFile = parseSourceFile(runtimeTypesPath, source);

  const providerId = getTypeAlias(sourceFile, 'AgentProviderId');
  const timelineEvent = getTypeAlias(sourceFile, 'AgentTimelineEvent');
  const threadRecord = getTypeAlias(sourceFile, 'AgentThreadRecord');
  const promptContext = getTypeAlias(sourceFile, 'AgentPromptContext');
  const contextBundle = getTypeAlias(sourceFile, 'AgentContextBundle');
  const memoryEntry = getTypeAlias(sourceFile, 'AgentMemoryEntry');

  assert.ok(providerId);
  assert.ok(timelineEvent);
  assert.ok(threadRecord);
  assert.ok(promptContext);
  assert.ok(contextBundle);
  assert.ok(memoryEntry);
  assert.ok(ts.isUnionTypeNode(providerId.type));
  assert.deepEqual(
    providerId.type.types.map((node) => node.literal.text),
    ['built-in', 'claude', 'codex'],
  );
  assert.ok(ts.isTypeReferenceNode(contextBundle.type));
  assert.equal(contextBundle.type.typeName.getText(sourceFile), 'AgentPromptContext');
});

test('platform bridge types include thread and memory context fields', async () => {
  const source = await readFile(bridgeTypesPath, 'utf8');
  const sourceFile = parseSourceFile(bridgeTypesPath, source);
  const promptContext = getTypeAlias(sourceFile, 'PlatformPromptContext');
  const workspaceSnapshot = getTypeAlias(sourceFile, 'WorkspaceSnapshot');
  const activityRecord = getTypeAlias(sourceFile, 'ActivityRecord');

  assert.ok(promptContext);
  assert.ok(workspaceSnapshot);
  assert.ok(activityRecord);
  assert.ok(ts.isTypeReferenceNode(promptContext.type));
  assert.equal(promptContext.type.typeName.getText(sourceFile), 'AgentPromptContext');
  assert.ok(ts.isTypeLiteralNode(workspaceSnapshot.type));
  assert.equal(getPropertyTypeNode(workspaceSnapshot.type, 'threadId')?.getText(sourceFile), 'string | null');
  assert.ok(ts.isTypeLiteralNode(activityRecord.type));
  assert.equal(getPropertyTypeNode(activityRecord.type, 'providerId')?.getText(sourceFile), 'AgentProviderId');
});
