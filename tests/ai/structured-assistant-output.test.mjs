import assert from 'node:assert/strict';
import test from 'node:test';

const loadParser = async () =>
  import(`../../src/modules/ai/runtime/output/parseStructuredAssistantOutput.ts?test=${Date.now()}`);

test('structured assistant output keeps plain replies as final text', async () => {
  const { parseStructuredAssistantOutput } = await loadParser();
  const parsed = parseStructuredAssistantOutput('直接回答用户');

  assert.equal(parsed.finalText, '直接回答用户');
  assert.equal(parsed.feedbackText, '');
  assert.equal(parsed.hasStructuredTags, false);
});

test('structured assistant output separates feedback from final text', async () => {
  const { parseStructuredAssistantOutput } = await loadParser();
  const parsed = parseStructuredAssistantOutput(`
<feedback>
正在检查文件。
</feedback>
<final>
这里是最终结果。
</final>
  `);

  assert.equal(parsed.feedbackText, '正在检查文件。');
  assert.equal(parsed.finalText, '这里是最终结果。');
  assert.equal(parsed.hasStructuredTags, true);
  assert.equal(parsed.hasFeedbackTag, true);
  assert.equal(parsed.hasFinalTag, true);
});

test('structured assistant output supports partial final blocks during streaming', async () => {
  const { parseStructuredAssistantOutput } = await loadParser();
  const parsed = parseStructuredAssistantOutput('<final>半段正文', { allowPartial: true });

  assert.equal(parsed.finalText, '半段正文');
  assert.equal(parsed.hasFinalTag, true);
});
