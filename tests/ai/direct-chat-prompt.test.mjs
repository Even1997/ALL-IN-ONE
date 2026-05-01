import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDirectChatPrompt } from '../../src/modules/ai/chat/directChatPrompt.ts';

test('buildDirectChatPrompt keeps default chat free-form when no explicit skill is provided', () => {
  const result = buildDirectChatPrompt({
    userInput: 'Help me organize the current knowledge',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
  });

  assert.equal(result.skillLabel, null);
  assert.match(result.prompt, /user_request:/);
  assert.match(result.prompt, /context_window:\s*200000 tokens/);
  assert.doesNotMatch(result.prompt, /mode:/);
  assert.doesNotMatch(result.prompt, /knowledge_context:/);
});

test('buildDirectChatPrompt adds explicit skill focus without injecting knowledge file bodies', () => {
  const result = buildDirectChatPrompt({
    userInput: 'Generate a home page design from the current sketch',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: {
      package: 'page',
      skill: 'ui-design',
      cleanedInput: 'Generate a home page design from the current sketch',
      token: '@UI',
    },
  });

  assert.equal(result.skillLabel, 'UI 设计');
  assert.match(result.prompt, /mode: UI 设计/);
  assert.match(result.prompt, /context_window:\s*200000 tokens/);
  assert.doesNotMatch(result.prompt, /knowledge_context:/);
  assert.doesNotMatch(result.prompt, /current_file/);
  assert.doesNotMatch(result.prompt, /related_files/);
});

test('buildDirectChatPrompt no longer injects agent plan metadata', () => {
  const result = buildDirectChatPrompt({
    userInput: 'Organize requirements',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
  });

  assert.doesNotMatch(result.prompt, /agent_plan:/);
  assert.match(result.prompt, /user_request:/);
});

test('buildDirectChatPrompt includes reference index and expanded file sections', () => {
  const result = buildDirectChatPrompt({
    userInput: 'Organize the home page plan with selected files',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
    referenceContext: {
      indexSection: '- sketch/pages/login.md | Login Sketch | Login structure',
      expandedSection: 'file: sketch/pages/login.md\n# Login Sketch',
      policySection: 'Use structured wiki pages before raw source files.',
      labels: ['selected files / 2'],
    },
  });

  assert.match(result.prompt, /reference_index:/);
  assert.match(result.prompt, /expanded_files:/);
  assert.match(result.prompt, /sketch\/pages\/login\.md/);
  assert.match(result.systemPrompt, /Use structured wiki pages before raw source files\./);
});

test('buildDirectChatPrompt includes recent conversation history before the new request', () => {
  const result = buildDirectChatPrompt({
    userInput: 'Now connect that to the right pane behavior',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
    conversationHistory: [
      { role: 'user', content: 'We decided GN Agent should keep context visible.' },
      { role: 'assistant', content: 'Yes, the Context lane should expose references and budget.' },
      { role: 'system', content: 'Internal fallback notice' },
    ],
  });

  assert.match(result.prompt, /conversation_history:/);
  assert.match(result.prompt, /user: We decided GN Agent should keep context visible\./);
  assert.match(result.prompt, /assistant: Yes, the Context lane should expose references and budget\./);
  assert.doesNotMatch(result.prompt, /Internal fallback notice/);
  assert.match(result.prompt, /user_request:\nNow connect that to the right pane behavior/);
});
