import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGNAgentMessageFlow } from '../src/components/ai/gn-agent/GNAgentMessageFlow.ts';

test('orders assistant thinking, text, and runtime cards by event time', () => {
  const sections = buildGNAgentMessageFlow([
    { kind: 'bubble', key: 'final', createdAt: 30 },
    { kind: 'thinking', key: 'thinking', createdAt: 10 },
    { kind: 'cards', key: 'tools', createdAt: 20 },
  ]);

  assert.deepEqual(sections, [
    { kind: 'thinking', keys: ['thinking'] },
    { kind: 'cards', keys: ['tools'] },
    { kind: 'bubble', keys: ['final'] },
  ]);
});

test('keeps repeated text and tool events in chronological order', () => {
  const sections = buildGNAgentMessageFlow([
    { kind: 'bubble', key: 'intro', createdAt: 10 },
    { kind: 'cards', key: 'read', createdAt: 20 },
    { kind: 'bubble', key: 'analysis', createdAt: 30 },
    { kind: 'cards', key: 'edit', createdAt: 40 },
    { kind: 'bubble', key: 'final', createdAt: 50 },
  ]);

  assert.deepEqual(sections, [
    { kind: 'bubble', keys: ['intro'] },
    { kind: 'cards', keys: ['read'] },
    { kind: 'bubble', keys: ['analysis'] },
    { kind: 'cards', keys: ['edit'] },
    { kind: 'bubble', keys: ['final'] },
  ]);
});
