import type { KnowledgeEntry } from '../../knowledge/knowledgeEntries';
import { buildKnowledgeProposal } from './buildKnowledgeProposal';
import { shouldSuggestKnowledgeProposal } from './shouldSuggestKnowledgeProposal';

const WIKI_TITLE_HINTS = ['总览', '清单', '术语', '问题', '决策', 'wiki', 'Wiki'];

const isWikiEntry = (entry: KnowledgeEntry | null) =>
  Boolean(
    entry &&
      entry.type === 'markdown' &&
      (entry.docType === 'wiki-index' || WIKI_TITLE_HINTS.some((hint) => entry.title.includes(hint)))
  );

const buildSuggestionTitle = (answerContent: string) => {
  const firstSentence = answerContent.replace(/\s+/g, ' ').trim().slice(0, 18);
  return firstSentence ? `AI 会话结论 ${firstSentence}.md` : 'AI 会话结论.md';
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

  const signals = {
    hasGap: !currentFile,
    hasStaleWiki: isWikiEntry(currentFile),
    hasDuplicates: false,
    canDistill: relatedFiles.length >= 2,
  };

  if (!shouldSuggestKnowledgeProposal(signals)) {
    return null;
  }

  const targetTitle = currentFile?.title || buildSuggestionTitle(normalizedAnswer);
  const evidence = [
    currentFile ? `current:${currentFile.title}` : 'chat:当前回答',
    ...relatedFiles.slice(0, 3).map((file) => `related:${file.title}`),
  ];

  const type = isWikiEntry(currentFile)
    ? 'update_wiki'
    : currentFile?.type === 'markdown'
      ? 'update_note'
      : 'create_note';

  const trigger = signals.hasStaleWiki ? 'wiki-stale' : signals.canDistill ? 'knowledge-organize' : 'answer-gap';

  return buildKnowledgeProposal({
    projectId,
    summary: isWikiEntry(currentFile)
      ? `发现 1 项 Wiki 更新建议：${targetTitle}`
      : currentFile
        ? `发现 1 项笔记补全建议：${targetTitle}`
        : `发现 1 项新增知识建议：${targetTitle}`,
    trigger,
    operations: [
      {
        type,
        targetId: currentFile?.type === 'markdown' ? currentFile.id : null,
        targetTitle,
        reason: isWikiEntry(currentFile)
          ? '当前回答形成了可沉淀的结构化结论，适合回写到 Wiki。'
          : currentFile
            ? '当前回答补充了已选知识条目，适合回写到现有笔记。'
            : '当前回答形成了新的项目事实，适合新增一条知识笔记。',
        evidence,
        draftContent: normalizedAnswer,
      },
    ],
  });
};
