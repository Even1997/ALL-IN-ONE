import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeStreamingMessageAssembler } from '../../src/modules/ai/runtime/orchestration/agentTurnRunner.ts';

test('runtime streaming assembler keeps internal protocol text out of the final answer', () => {
  const assembler = createRuntimeStreamingMessageAssembler();

  assembler.append({ kind: 'text', delta: '总结如下：当前项目包含 docs。' });
  assembler.append({
    kind: 'text',
    delta: '\n<|DSML| tool_calls>\n<|DSML| invoke name="ls">\n<|DSML| parameter name="path" string="true">/</|DSML| parameter>\n',
  });
  assembler.append({ kind: 'text', delta: '</|DSML| invoke>\n</|DSML| tool_calls>\n' });

  const draft = assembler.buildFinal('总结如下：当前项目包含 docs。');

  assert.equal(draft.answerContent, '总结如下：当前项目包含 docs。');
  assert.doesNotMatch(draft.content, /DSML|tool_calls>|invoke name=|parameter name=/);
});
