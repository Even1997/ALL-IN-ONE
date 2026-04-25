export type AIStatusCard = {
  title: string;
  content: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
};

export const buildAIStatusCards = (options: {
  latestInstruction: string;
  latestResponse: string;
  activeSkillLabel?: string | null;
  knowledgeContextSummary?: string;
  isLoading: boolean;
  isConfigured: boolean;
}): AIStatusCard[] => {
  const { latestInstruction, latestResponse, activeSkillLabel, knowledgeContextSummary, isLoading, isConfigured } = options;
  const cards: AIStatusCard[] = [];

  if (activeSkillLabel) {
    cards.push({
      title: '当前模式',
      content: activeSkillLabel,
      tone: 'neutral',
    });
  }

  if (latestInstruction.trim()) {
    cards.push({
      title: '最新输入',
      content: latestInstruction.trim(),
      tone: 'neutral',
    });
  }

  if (!isConfigured) {
    cards.push({
      title: '当前状态',
      content: '配置 provider、API Key 和 model 后即可开始自由对话。',
      tone: 'warning',
    });
  } else if (isLoading) {
    cards.push({
      title: '当前状态',
      content: 'AI 正在直接处理当前请求，不会自动进入下一阶段。',
      tone: 'warning',
    });
  } else if (latestResponse.trim()) {
    cards.push({
      title: '最近回复',
      content: latestResponse.trim(),
      tone: 'success',
    });
  } else {
    cards.push({
      title: '当前状态',
      content: '直接输入问题、整理指令，或用 @技能 指定能力即可。',
      tone: 'neutral',
    });
  }

  if (knowledgeContextSummary) {
    cards.push({
      title: '知识上下文',
      content: knowledgeContextSummary,
      tone: 'neutral',
    });
  }

  return cards;
};
