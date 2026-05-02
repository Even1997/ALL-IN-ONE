import assert from 'node:assert/strict';
import test from 'node:test';

const loadModule = async () =>
  import(`../../src/modules/ai/chat/projectFilePlanningPrompt.ts?test=${Date.now()}`);

test('project file planning prompt carries recent conversation and latest assistant output for save flows', async () => {
  const { buildProjectFilePlanningPrompt } = await loadModule();

  const prompt = buildProjectFilePlanningPrompt({
    userInput: '保存文件',
    conversationHistory: [
      { role: 'user', content: '你好，写个动漫追番日记的需求文档' },
      {
        role: 'assistant',
        content: '# 动漫追番日记\n\n## 项目概述\n- 记录追番进度\n- 支持观后感日记',
      },
    ],
  });

  assert.match(prompt, /recent_conversation:/);
  assert.match(prompt, /latest_assistant_output:/);
  assert.match(prompt, /# 动漫追番日记/);
  assert.match(prompt, /如果已经有明确正文，缺少的只是文件名或路径/);
});

test('project file planning prompt strips internal thinking from assistant output', async () => {
  const { buildProjectFilePlanningPrompt } = await loadModule();

  const prompt = buildProjectFilePlanningPrompt({
    userInput: '确认保存',
    conversationHistory: [
      {
        role: 'assistant',
        content: '<think>internal</think>\n# Spec\n\n正文',
      },
    ],
  });

  assert.match(prompt, /# Spec/);
  assert.doesNotMatch(prompt, /internal/);
  assert.doesNotMatch(prompt, /<think>/);
});
