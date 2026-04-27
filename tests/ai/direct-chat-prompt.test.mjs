import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDirectChatPrompt } from '../../src/modules/ai/chat/directChatPrompt.ts';

test('buildDirectChatPrompt keeps default chat free-form when no explicit skill is provided', () => {
  const result = buildDirectChatPrompt({
    userInput: '帮我整理当前知识',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
    knowledgeSelection: {
      currentFile: null,
      relatedFiles: [],
    },
  });

  assert.equal(result.skillLabel, null);
  assert.match(result.systemPrompt, /自然对话式/);
  assert.doesNotMatch(result.systemPrompt, /整理知识/);
  assert.doesNotMatch(result.systemPrompt, /草图/);
  assert.doesNotMatch(result.systemPrompt, /UI设计/);
  assert.doesNotMatch(result.prompt, /mode:/);
  assert.match(result.prompt, /user_request:/);
  assert.match(result.prompt, /context_window:\s*200000 tokens/);
});

test('buildDirectChatPrompt adds explicit skill focus and knowledge context', () => {
  const result = buildDirectChatPrompt({
    userInput: '基于当前草图生成首页设计',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: {
      package: 'page',
      skill: 'ui-design',
      cleanedInput: '基于当前草图生成首页设计',
    },
    knowledgeSelection: {
      currentFile: {
        id: 'doc-1',
        title: '首页草图.md',
        summary: '首页有头图、推荐区和底部导航',
        content: '# 首页草图',
        type: 'markdown',
        source: 'requirement',
        updatedAt: new Date().toISOString(),
        status: 'ready',
        kind: 'sketch',
        tags: ['sketch'],
        relatedIds: ['doc-2'],
      },
      relatedFiles: [
        {
          id: 'doc-2',
          title: '视觉说明.md',
          summary: '卡片轻量、留白充足',
          content: '使用卡片和浅色背景',
          type: 'markdown',
          source: 'requirement',
          updatedAt: new Date().toISOString(),
          status: 'ready',
          kind: 'note',
          tags: ['style'],
          relatedIds: [],
        },
      ],
    },
  });

  assert.equal(result.skillLabel, 'UI 设计');
  assert.match(result.prompt, /mode: UI 设计/);
  assert.match(result.prompt, /current_file/);
  assert.match(result.prompt, /related_files/);
  assert.match(result.prompt, /首页草图\.md/);
  assert.match(result.systemPrompt, /@技能/);
  assert.match(result.prompt, /context_window:\s*200000 tokens/);
});

test('buildDirectChatPrompt no longer injects agent plan metadata', () => {
  const result = buildDirectChatPrompt({
    userInput: '整理需求',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
    knowledgeSelection: {
      currentFile: null,
      relatedFiles: [],
    },
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
    knowledgeSelection: {
      currentFile: null,
      relatedFiles: [],
    },
    referenceContext: {
      indexSection: '- sketch/pages/login.md | Login Sketch | Login structure',
      expandedSection: 'file: sketch/pages/login.md\n# Login Sketch',
      labels: ['已选文件 / 2'],
    },
  });

  assert.match(result.prompt, /reference_index:/);
  assert.match(result.prompt, /expanded_files:/);
  assert.match(result.prompt, /sketch\/pages\/login\.md/);
});

test('buildDirectChatPrompt includes recent conversation history before the new request', () => {
  const result = buildDirectChatPrompt({
    userInput: 'Now connect that to the right pane behavior',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
    knowledgeSelection: {
      currentFile: null,
      relatedFiles: [],
    },
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
