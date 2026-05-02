import { buildConversationHistorySection } from './directChatPrompt.ts';

type ProjectFilePlanningConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

const stripInternalThinking = (content: string) =>
  content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .trim();

const findLatestAssistantOutput = (messages: ProjectFilePlanningConversationMessage[] = []) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }

    const normalizedContent = stripInternalThinking(message.content);
    if (normalizedContent) {
      return normalizedContent;
    }
  }

  return '';
};

export const buildProjectFilePlanningPrompt = (input: {
  userInput: string;
  conversationHistory?: ProjectFilePlanningConversationMessage[];
}) => {
  const conversationHistorySection = buildConversationHistorySection(input.conversationHistory || []);
  const latestAssistantOutput = findLatestAssistantOutput(input.conversationHistory || []);

  return [
    '请根据用户请求规划项目文件写操作。',
    conversationHistorySection ? `recent_conversation:\n${conversationHistorySection}` : null,
    latestAssistantOutput ? `latest_assistant_output:\n${latestAssistantOutput}` : null,
    `user_request:\n${input.userInput}`,
    '如果用户当前是在承接上一轮结果做“保存、写入、落盘、确认保存”这类请求，优先复用 latest_assistant_output 作为待写入正文。',
    '如果已经有明确正文，缺少的只是文件名或路径，只澄清路径，不要再次要求用户提供内容。',
    '如果这是新建、编辑或删除文件的请求，请返回 JSON 计划。',
    '如果用户请求不明确，返回 needs_clarification。',
    '如果请求不应该执行，返回 reject。',
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n\n');
};
