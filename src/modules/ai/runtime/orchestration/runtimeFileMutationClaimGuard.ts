type FileMutationToolCall = {
  status: string;
  fileChanges?: Array<{
    path: string;
    beforeContent: string | null;
    afterContent: string | null;
    verified?: boolean;
  }> | null;
};

const FILE_MUTATION_SUCCESS_CLAIM_PATTERN =
  /(?:\u5df2(?:\u7ecf)?(?:\u4fdd\u5b58|\u5199\u5165|\u521b\u5efa|\u65b0\u5efa|\u4fee\u6539|\u66f4\u65b0|\u7f16\u8f91|\u5220\u9664)|\u4fdd\u5b58(?:\u5230|\u4e3a|\u6210)|\u5199(?:\u5165|\u5230)|created|saved|updated|modified|edited|deleted)/i;

const NEGATED_FILE_MUTATION_CLAIM_PATTERN =
  /(?:(?:\u672a|\u6ca1\u6709|\u5c1a\u672a|\u4e0d\u80fd|\u65e0\u6cd5|\u5931\u8d25).{0,12}(?:\u4fdd\u5b58|\u5199\u5165|\u521b\u5efa|\u65b0\u5efa|\u4fee\u6539|\u66f4\u65b0|\u7f16\u8f91|\u5220\u9664)|(?:\u4fdd\u5b58|\u5199\u5165|\u521b\u5efa|\u65b0\u5efa|\u4fee\u6539|\u66f4\u65b0|\u7f16\u8f91|\u5220\u9664).{0,12}(?:\u5931\u8d25|\u672a\u6210\u529f))/i;

const UNVERIFIED_FILE_MUTATION_MESSAGE =
  '\u6211\u8fd8\u6ca1\u6709\u62ff\u5230\u6210\u529f\u7684\u9879\u76ee\u6587\u4ef6\u53d8\u66f4\u7ed3\u679c\uff0c\u56e0\u6b64\u4e0d\u80fd\u786e\u8ba4\u5df2\u4fdd\u5b58\u3001\u5df2\u4fee\u6539\u6216\u5df2\u5220\u9664\u3002\u8bf7\u660e\u786e\u76ee\u6807\u6587\u4ef6\u540e\u6211\u4f1a\u901a\u8fc7\u6587\u4ef6\u53d8\u66f4\u6d41\u7a0b\u6267\u884c\u3002';

const hasVerifiedFileMutationToolResult = (toolCalls: FileMutationToolCall[]) =>
  toolCalls.some(
    (toolCall) =>
      toolCall.status === 'completed' &&
      Array.isArray(toolCall.fileChanges) &&
      toolCall.fileChanges.some((change) => change.path.trim().length > 0 && change.verified === true)
  );

export const guardUnverifiedFileMutationClaims = (input: {
  content: string;
  toolCalls: FileMutationToolCall[];
}) => {
  const normalizedContent = input.content.trim();
  if (!normalizedContent) {
    return input.content;
  }

  if (!FILE_MUTATION_SUCCESS_CLAIM_PATTERN.test(normalizedContent)) {
    return input.content;
  }

  if (NEGATED_FILE_MUTATION_CLAIM_PATTERN.test(normalizedContent)) {
    return input.content;
  }

  if (hasVerifiedFileMutationToolResult(input.toolCalls)) {
    return input.content;
  }

  return UNVERIFIED_FILE_MUTATION_MESSAGE;
};
