import type { KnowledgeEntry } from '../../knowledge/knowledgeEntries';
import { buildKnowledgeProposal } from './buildKnowledgeProposal';
import { shouldSuggestKnowledgeProposal } from './shouldSuggestKnowledgeProposal';

const SYSTEM_INDEX_TITLE_HINTS = ['总览', '清单', '术语', '问题', '决策', 'wiki', 'Wiki', '索引', 'Index'];

const isSystemIndexEntry = (entry: KnowledgeEntry | null) =>
  Boolean(
    entry &&
      entry.type === 'markdown' &&
      (entry.docType === 'wiki-index' || SYSTEM_INDEX_TITLE_HINTS.some((hint) => entry.title.includes(hint)))
  );

const resolveWritableNote = (entry: KnowledgeEntry | null) =>
  entry && entry.type === 'markdown' && !isSystemIndexEntry(entry) ? entry : null;

const buildSuggestionTitle = (answerContent: string) => {
  const firstSentence = answerContent.replace(/\s+/g, ' ').trim().slice(0, 18);
  return firstSentence ? `AI 对话结论 ${firstSentence}.md` : 'AI 对话结论.md';
};

export const suggestKnowledgeProposalFromAnswer = ({
  projectId,
  answerContent,
  currentFile,
  relatedFiles,
}: {
  projectId: string;
  answerContent: string;
  currentFile: KnowledgeEntry | null;
  relatedFiles: KnowledgeEntry[];
}) => {
  const normalizedAnswer = answerContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (normalizedAnswer.length < 80) {
    return null;
  }

  const writableCurrentFile = resolveWritableNote(currentFile);
  const signals = {
    hasGap: !writableCurrentFile,
    hasStaleWiki: false,
    hasDuplicates: false,
    canDistill: relatedFiles.length >= 2,
  };

  if (!shouldSuggestKnowledgeProposal(signals)) {
    return null;
  }

  const targetTitle = writableCurrentFile?.title || buildSuggestionTitle(normalizedAnswer);
  const evidence = [
    writableCurrentFile ? `current:${writableCurrentFile.title}` : 'chat:当前回答',
    ...relatedFiles.slice(0, 3).map((file) => `related:${file.title}`),
  ];

  return buildKnowledgeProposal({
    projectId,
    summary: writableCurrentFile
      ? `发现 1 项笔记补全建议：${targetTitle}`
      : `发现 1 项新增知识建议：${targetTitle}`,
    trigger: signals.canDistill ? 'knowledge-organize' : 'answer-gap',
    operations: [
      {
        type: writableCurrentFile ? 'update_note' : 'create_note',
        targetId: writableCurrentFile?.id || null,
        targetTitle,
        reason: writableCurrentFile
          ? '当前回答补充了已选知识条目，适合回写到现有笔记。'
          : '当前回答形成了新的项目事实，适合新增一条用户可维护的知识笔记。',
        evidence,
        draftContent: normalizedAnswer,
      },
    ],
  });
};
