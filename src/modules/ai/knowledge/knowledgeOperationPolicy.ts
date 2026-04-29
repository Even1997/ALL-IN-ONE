export const buildKnowledgeOperationPolicy = () =>
  [
    'AI 对知识库默认只读。',
    'AI 可以查询、搜索、比较和总结知识库内容，但不能直接修改知识库。',
    '所有写入必须先生成提案，并等待用户批准。',
    '删除不是允许的直接动作，AI 不能直接删除 note 或 wiki。',
    '需要删除时，只能建议归档、合并候选或待清理标记。',
    '新事实优先进入 note，稳定结论优先进入 wiki。',
  ].join('\n');
