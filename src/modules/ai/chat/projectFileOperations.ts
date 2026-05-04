export type ProjectFileOperationMode = 'manual' | 'auto';
export type ProjectFileOperationType = 'create_file' | 'edit_file' | 'delete_file';
export type ProjectFileProposalStatus = 'pending' | 'executing' | 'executed' | 'cancelled' | 'failed';

export type ProjectFileOperation = {
  id: string;
  type: ProjectFileOperationType;
  targetPath: string;
  summary: string;
  content?: string;
  oldString?: string;
  newString?: string;
};

export type ProjectFileOperationPlan = {
  status: 'ready' | 'needs_clarification' | 'reject';
  assistantMessage: string;
  summary: string;
  operations: ProjectFileOperation[];
};

export type ProjectFileProposal = {
  id: string;
  mode: ProjectFileOperationMode;
  status: ProjectFileProposalStatus;
  summary: string;
  assistantMessage: string;
  operations: ProjectFileOperation[];
  executionMessage?: string | null;
};

export type PendingProjectFileProposalMessage = {
  id: string;
  projectFileProposal?: ProjectFileProposal;
};

export type PendingProjectFileProposalAction = {
  messageId: string;
  proposal: ProjectFileProposal;
};

export type ProjectFileRequestKind = 'read' | 'write' | 'none';

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/;

const SUPPORTED_TEXT_FILE_EXTENSIONS = new Set([
  'css',
  'html',
  'js',
  'json',
  'jsx',
  'markdown',
  'md',
  'txt',
  'ts',
  'tsx',
  'yaml',
  'yml',
]);

const WRITE_INTENT_PATTERN =
  /(?:\u65b0\u5efa|\u521b\u5efa|\u751f\u6210(?:\u4e00\u4e2a)?(?:\u6587\u4ef6|\u6587\u6863)?|\u5199\u5165|\u5199\u5230|\u4fdd\u5b58(?:\u6210|\u5230)?|\u53e6\u5b58\u4e3a|\u7f16\u8f91|\u4fee\u6539|\u66f4\u65b0|\u91cd\u5199|\u66ff\u6362|\u5220\u9664|\u79fb\u9664|remove|delete|create|write|edit|update|save)/i;

const READ_INTENT_PATTERN =
  /(?:\u67e5\u770b|\u8bfb\u53d6|\u8bfb\u4e00\u4e0b|\u6253\u5f00|\u5217\u51fa|\u770b\u770b|\u641c\u7d22|\u67e5\u627e|\u76ee\u5f55|\u6587\u4ef6\u5185\u5bb9|read|open|show|list|search|grep)/i;

const TASK_WRITE_VERB_PATTERN =
  /(?:\u4fee\u590d|\u4fee\u6539|\u91cd\u5199|\u6539\u5199|\u7f16\u8f91|\u66f4\u65b0|\u5b8c\u5584|\u6574\u7406|\u4f18\u5316|\u8865\u5168|\u540c\u6b65|\u6539\u6389|fix|rewrite|refactor|update|edit|organize|sync)/i;

const TASK_WRITE_TARGET_PATTERN =
  /(?:\u6587\u4ef6|\u6587\u6863|\u4ee3\u7801|\u914d\u7f6e|\u9879\u76ee|\u9875\u9762|\u7ec4\u4ef6|\u6a21\u5757|README|PRD|docs[\\/]|src[\\/]|package\.json|tsconfig|\.md\b|\.tsx?\b|\.jsx?\b|\.json\b|\.ya?ml\b|\.css\b|\.html\b)/i;

const QUESTION_ONLY_PATTERN = /(^|\s)(?:\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u5982\u4f55|what|why|how|which)(\s|$)|\?/i;

const ANALYSIS_ONLY_PATTERN =
  /(?:\u603b\u7ed3|\u6982\u8981|\u5206\u6790|\u89e3\u91ca|\u8bf4\u660e|\u5bf9\u6bd4|\u6bd4\u8f83|\u68c0\u67e5|review|summary|summarize|analyze|analysis|compare|explain|inspect)/i;

const FILE_MANAGEMENT_WRITE_PATTERN =
  /(?:\u65b0\u5efa|\u521b\u5efa|\u751f\u6210(?:\u4e00\u4e2a)?(?:\u6587\u4ef6|\u6587\u6863)?|\u5199\u5165|\u5199\u5230|\u4fdd\u5b58(?:\u6210|\u5230)?|\u53e6\u5b58\u4e3a|\u843d\u76d8|\u5220\u9664|\u79fb\u9664|\u91cd\u547d\u540d|\u79fb\u52a8|remove|delete|create|write|save|rename|move)/i;

const EXPLICIT_FILE_READ_PATTERN =
  /(?:\u67e5\u770b|\u8bfb\u53d6|\u8bfb\u4e00\u4e0b|\u6253\u5f00|\u5217\u51fa|\u770b\u770b|\u6d4f\u89c8|\u641c\u7d22|\u67e5\u627e|\u68c0\u7d22|read|open|show|list|search|grep)/i;

const EXPLICIT_FILE_REFERENCE_PATTERN =
  /(?:README|package\.json|tsconfig|docs[\\/]|files?[\\/]|folders?[\\/]|directories?[\\/]|(?:^|[\s"'`(\[\u3008\u300a\uff08])(?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/])?(?:[^\\/\s"'`，。；：！？,.;:!?()\[\]\u3008\u3009\u300a\u300b\uff08\uff09]+[\\/])+[^\\/\s"'`，。；：！？,.;:!?()\[\]\u3008\u3009\u300a\u300b\uff08\uff09]+)/i;

const FILE_NOUN_PATTERN =
  /(?:\u6587\u4ef6|\u6587\u6863|\u76ee\u5f55|README|readme|package\.json|tsconfig|content|contents|folder|directory|file|doc)/i;

const SHORT_PENDING_ACTION_AFFIRMATIVE_PATTERN =
  /^(?:\u597d|\u597d\u7684|\u53ef\u4ee5|\u884c|\u884c\u7684|\u55ef|\u55ef\u55ef|\u786e\u8ba4|\u4fdd\u5b58|\u5bf9|\u662f|\u662f\u7684|ok|okay|yes|yep|sure|go ahead)[\s\u3002\uff01!.,]*$/i;

const SHORT_PENDING_ACTION_NEGATIVE_PATTERN =
  /^(?:\u4e0d|\u4e0d\u8981|\u4e0d\u7528|\u5148\u4e0d|\u7b97\u4e86|\u53d6\u6d88|no|nope|cancel)[\s\u3002\uff01!.,]*$/i;

const trimLeadingSeparators = (value: string) => value.replace(/^[\\/]+/, '');

const trimTrailingSeparators = (value: string) => value.replace(/[\\/]+$/, '');

const usesWindowsPathSemantics = (value: string) =>
  WINDOWS_DRIVE_PATH_PATTERN.test(value) || WINDOWS_UNC_PATH_PATTERN.test(value) || value.includes('\\');

const isAbsoluteFilePath = (value: string) =>
  value.startsWith('/') || WINDOWS_DRIVE_PATH_PATTERN.test(value) || WINDOWS_UNC_PATH_PATTERN.test(value);

const normalizeRelativeFileSystemPath = (value: string) =>
  trimTrailingSeparators(trimLeadingSeparators(value.replace(/[\\/]+/g, '/')));

const joinFileSystemPath = (basePath: string, ...segments: string[]) => {
  const separator = usesWindowsPathSemantics(basePath) ? '\\' : '/';
  const normalizedBase = trimTrailingSeparators(basePath);
  const normalizedSegments = segments
    .map((segment) => segment.replace(/[\\/]+/g, separator))
    .map((segment) => trimLeadingSeparators(segment))
    .filter(Boolean);

  return [normalizedBase, ...normalizedSegments].join(separator);
};

const getRelativePathFromRoot = (absolutePath: string, rootPath: string) => {
  const normalizedAbsolutePath = trimTrailingSeparators(absolutePath.replace(/[\\/]+/g, '/'));
  const normalizedRootPath = trimTrailingSeparators(rootPath.replace(/[\\/]+/g, '/'));

  if (!normalizedRootPath) {
    return null;
  }

  const useCaseInsensitiveComparison =
    usesWindowsPathSemantics(absolutePath) || usesWindowsPathSemantics(rootPath);
  const comparableAbsolutePath = useCaseInsensitiveComparison
    ? normalizedAbsolutePath.toLowerCase()
    : normalizedAbsolutePath;
  const comparableRootPath = useCaseInsensitiveComparison ? normalizedRootPath.toLowerCase() : normalizedRootPath;

  if (comparableAbsolutePath === comparableRootPath) {
    return '';
  }

  const prefix = `${comparableRootPath}/`;
  if (!comparableAbsolutePath.startsWith(prefix)) {
    return null;
  }

  return normalizedAbsolutePath.slice(normalizedRootPath.length + 1);
};

const extractExtension = (value: string) => {
  const normalized = value.replace(/[\\/]+/g, '/').trim();
  const baseName = normalized.split('/').pop() || normalized;
  const parts = baseName.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
};

const normalizeAbsolutePathForComparison = (value: string) => {
  const normalized = value.replace(/[\\/]+/g, '/').replace(/\/+$/g, '');
  return usesWindowsPathSemantics(value) ? normalized.toLowerCase() : normalized;
};

const buildOperationId = (type: ProjectFileOperationType, targetPath: string, index: number) =>
  `${type}:${targetPath}:${index}`;

const extractJsonPayload = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('AI did not return a file operation plan.');
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      return JSON.parse(fencedMatch[1]) as unknown;
    }

    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      return JSON.parse(objectMatch[0]) as unknown;
    }
  }

  throw new Error('Failed to parse the AI file operation plan.');
};

const containsExplicitFileReference = (value: string) =>
  EXPLICIT_FILE_REFERENCE_PATTERN.test(value) || FILE_NOUN_PATTERN.test(value);

const looksLikeExplicitProjectFileWriteRequest = (value: string) =>
  FILE_MANAGEMENT_WRITE_PATTERN.test(value) && containsExplicitFileReference(value);

const looksLikeExplicitProjectFileReadRequest = (value: string) => {
  if (looksLikeExplicitProjectFileWriteRequest(value)) {
    return false;
  }

  if (!EXPLICIT_FILE_READ_PATTERN.test(value) || TASK_WRITE_VERB_PATTERN.test(value)) {
    return false;
  }

  return containsExplicitFileReference(value);
};

export const isSupportedProjectTextFilePath = (value: string) =>
  SUPPORTED_TEXT_FILE_EXTENSIONS.has(extractExtension(value));

export const detectProjectFileWriteIntent = (value: string) => WRITE_INTENT_PATTERN.test(value);

export const detectProjectFileReadIntent = (value: string) =>
  READ_INTENT_PATTERN.test(value) && !detectProjectFileWriteIntent(value);

export const resolveProjectFileRequestKind = (input: {
  rawInput: string;
  cleanedInput?: string | null;
}): ProjectFileRequestKind => {
  const candidates = [input.rawInput, input.cleanedInput || '']
    .map((value) => value.trim())
    .filter(Boolean);

  if (candidates.some((value) => looksLikeExplicitProjectFileWriteRequest(value))) {
    return 'write';
  }

  if (candidates.some((value) => looksLikeExplicitProjectFileReadRequest(value))) {
    return 'read';
  }

  return 'none';
};

export const shouldForceProjectFileProposal = (value: string) =>
  /(?:\u5148(?:\u7ed9\u6211)?\u770b(?:\u4e00\u4e0b)?|\u5148\u786e\u8ba4|\u786e\u8ba4\u4e00\u4e0b|\u4e0d\u8981\u76f4\u63a5\u5199|\u5148\u522b\u5199|\u5148\u51fa(?:\u65b9\u6848|\u8ba1\u5212)|preview|review first|show me (?:the )?(?:plan|changes))/i.test(
    value.trim()
  );

export const isShortPendingActionAffirmation = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return Boolean(
    normalized &&
      SHORT_PENDING_ACTION_AFFIRMATIVE_PATTERN.test(normalized) &&
      !SHORT_PENDING_ACTION_NEGATIVE_PATTERN.test(normalized)
  );
};

export const isShortPendingActionRejection = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return Boolean(normalized && SHORT_PENDING_ACTION_NEGATIVE_PATTERN.test(normalized));
};

export const findLatestPendingProjectFileProposalAction = (
  messages: PendingProjectFileProposalMessage[]
): PendingProjectFileProposalAction | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const proposal = message?.projectFileProposal;

    if (proposal?.status === 'pending') {
      return {
        messageId: message.id,
        proposal,
      };
    }
  }

  return null;
};

export const detectTaskAuthorizedProjectWriteIntent = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  const normalizedLower = normalized.toLowerCase();
  const hasTaskVerb =
    TASK_WRITE_VERB_PATTERN.test(normalized) ||
    normalized.includes('\u4fee\u4e00\u4e0b') ||
    normalized.includes('\u6574\u7406\u4e00\u4e0b') ||
    normalized.includes('\u91cd\u5199');
  const hasTaskTarget =
    TASK_WRITE_TARGET_PATTERN.test(normalized) ||
    normalizedLower.includes('readme') ||
    normalizedLower.includes('package.json') ||
    normalizedLower.includes('tsconfig') ||
    normalizedLower.includes('src/') ||
    normalizedLower.includes('docs/');

  if (
    (normalized.includes('\u6574\u7406\u4e00\u4e0b') ||
      normalized.includes('\u91cd\u5199') ||
      normalized.includes('\u4fee\u4e00\u4e0b')) &&
    (normalizedLower.includes('readme') ||
      normalizedLower.includes('package.json') ||
      normalizedLower.includes('src/') ||
      normalizedLower.includes('docs/') ||
      normalized.includes('\u6587\u6863') ||
      normalized.includes('\u6587\u4ef6'))
  ) {
    return true;
  }

  if (detectProjectFileWriteIntent(normalized)) {
    return true;
  }

  if (ANALYSIS_ONLY_PATTERN.test(normalized) && !hasTaskVerb) {
    return false;
  }

  if (detectProjectFileReadIntent(normalized)) {
    return false;
  }

  if (QUESTION_ONLY_PATTERN.test(normalized) && !TASK_WRITE_VERB_PATTERN.test(normalized)) {
    return false;
  }

  return hasTaskVerb && hasTaskTarget;
};

export const resolveProjectOperationPath = (projectRoot: string, targetPath: string) => {
  const trimmedTargetPath = targetPath.trim();
  if (!trimmedTargetPath) {
    throw new Error('File path cannot be empty.');
  }

  if (!isAbsoluteFilePath(trimmedTargetPath)) {
    const normalizedRelativePath = normalizeRelativeFileSystemPath(trimmedTargetPath);
    const segments = normalizedRelativePath.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new Error('Cannot access files outside the current project root.');
    }
  }

  const absolutePath = isAbsoluteFilePath(trimmedTargetPath)
    ? trimmedTargetPath
    : joinFileSystemPath(projectRoot, normalizeRelativeFileSystemPath(trimmedTargetPath));
  const relativePath = getRelativePathFromRoot(absolutePath, projectRoot);

  if (
    relativePath === null &&
    normalizeAbsolutePathForComparison(absolutePath) !== normalizeAbsolutePathForComparison(projectRoot)
  ) {
    throw new Error('Cannot operate on files outside the current project root.');
  }

  return absolutePath;
};

export const parseProjectFileOperationsPlan = (raw: string): ProjectFileOperationPlan => {
  const parsed = extractJsonPayload(raw) as Partial<ProjectFileOperationPlan> & {
    operations?: Array<Partial<ProjectFileOperation>>;
  };

  const status =
    parsed.status === 'ready' || parsed.status === 'needs_clarification' || parsed.status === 'reject'
      ? parsed.status
      : 'reject';
  const assistantMessage = typeof parsed.assistantMessage === 'string' ? parsed.assistantMessage : '';
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const operations = Array.isArray(parsed.operations)
    ? parsed.operations.reduce<ProjectFileOperation[]>((accumulator, operation, index) => {
        const type =
          operation.type === 'create_file' || operation.type === 'edit_file' || operation.type === 'delete_file'
            ? operation.type
            : null;
        const targetPath = typeof operation.targetPath === 'string' ? operation.targetPath.trim() : '';
        const operationSummary = typeof operation.summary === 'string' ? operation.summary : '';

        if (!type || !targetPath) {
          return accumulator;
        }

        accumulator.push({
          id: buildOperationId(type, targetPath, index),
          type,
          targetPath,
          summary: operationSummary,
          content: typeof operation.content === 'string' ? operation.content : undefined,
          oldString: typeof operation.oldString === 'string' ? operation.oldString : undefined,
          newString: typeof operation.newString === 'string' ? operation.newString : undefined,
        });

        return accumulator;
      }, [])
    : [];

  return {
    status,
    assistantMessage,
    summary,
    operations,
  };
};
