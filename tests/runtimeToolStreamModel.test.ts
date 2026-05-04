import assert from 'node:assert/strict';
import { buildRuntimeToolStreamModel } from '../src/components/workspace/runtimeEventRenderModel';
import type { StoredChatRuntimeEvent } from '../src/modules/ai/store/aiChatStore';

const events: StoredChatRuntimeEvent[] = [
  {
    id: 'use-read',
    kind: 'tool_use',
    toolCallId: 'read',
    parentToolCallId: null,
    toolName: 'view',
    input: { file_path: 'src/App.tsx' },
    status: 'completed',
    createdAt: 1,
  },
  {
    id: 'result-read',
    kind: 'tool_result',
    toolCallId: 'read',
    parentToolCallId: null,
    toolName: 'view',
    status: 'completed',
    output: 'file content',
    createdAt: 2,
  },
  {
    id: 'use-bash',
    kind: 'tool_use',
    toolCallId: 'bash',
    parentToolCallId: null,
    toolName: 'bash',
    input: { command: 'npm test' },
    status: 'running',
    createdAt: 3,
  },
];

const streamModel = buildRuntimeToolStreamModel(events);

assert.equal(streamModel.items.length, 1);
assert.equal(streamModel.items[0]?.kind, 'tool_group');
assert.equal(streamModel.items[0]?.toolUses.length, 2);
assert.equal(streamModel.resultMap.get('read')?.output, 'file content');
assert.equal(streamModel.resultMap.has('bash'), false);
