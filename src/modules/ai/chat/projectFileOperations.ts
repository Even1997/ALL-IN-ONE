// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/;

const SHORT_PENDING_ACTION_AFFIRMATIVE_PATTERN =
  /^(?:\u597d|\u597d\u7684|\u53ef\u4ee5|\u884c|\u884c\u7684|\u55ef|\u55ef\u55ef|\u786e\u8ba4|\u4fdd\u5b58|\u5bf9|\u662f|\u662f\u7684|ok|okay|yes|yep|sure|go ahead)[\s\u3002\uff01!.,]*$/i;

const SHORT_PENDING_ACTION_NEGATIVE_PATTERN =
  /^(?:\u4e0d|\u4e0d\u8981|\u4e0d\u7528|\u5148\u4e0d|\u7b97\u4e86|\u53d6\u6d88|no|nope|cancel)[\s\u3002\uff01!.,]*$/i;

const PROJECT_FILE_WRITE_ACCESS_FAILURE_PATTERN =
  /(?:permission denied|access(?:\s+is)? denied|\u62d2\u7edd\u8bbf\u95ee|os error 5|sharing violation|used by another process|being used by another process)/i;

const trimLeadingSeparators = (value: string) => value.replace(/^[\\/]+/, '');

const trimTrailingSeparators = (value: string) => value.replace(/[\\/]+$/, '');

const stripWindowsExtendedLengthPathPrefix = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\\\\\?\\UNC\\/i.test(trimmed)) {
    return `\\\\${trimmed.slice(8)}`;
  }

  if (/^\\\\\?\\/.test(trimmed)) {
    return trimmed.slice(4);
  }

  if (/^\/{2,}\?\/UNC\//i.test(trimmed)) {
    return `//${trimmed.replace(/^\/{2,}\?\/UNC\//i, '')}`;
  }

  if (/^\/{2,}\?\//.test(trimmed)) {
    return trimmed.replace(/^\/{2,}\?\//, '');
  }

  return trimmed;
};

const usesWindowsPathSemantics = (value: string) =>
  WINDOWS_DRIVE_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value)) ||
  WINDOWS_UNC_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value)) ||
  stripWindowsExtendedLengthPathPrefix(value).includes('\\');

const isAbsoluteFilePath = (value: string) =>
  stripWindowsExtendedLengthPathPrefix(value).startsWith('/') ||
  WINDOWS_DRIVE_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value)) ||
  WINDOWS_UNC_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value));

const normalizeRelativeFileSystemPath = (value: string) =>
  trimTrailingSeparators(
    trimLeadingSeparators(stripWindowsExtendedLengthPathPrefix(value).replace(/[\\/]+/g, '/'))
  );

const joinFileSystemPath = (basePath: string, ...segments: string[]) => {
  const normalizedBasePath = stripWindowsExtendedLengthPathPrefix(basePath);
  const separator = usesWindowsPathSemantics(normalizedBasePath) ? '\\' : '/';
  const normalizedBase = trimTrailingSeparators(normalizedBasePath);
  const normalizedSegments = segments
    .map((segment) => stripWindowsExtendedLengthPathPrefix(segment).replace(/[\\/]+/g, separator))
    .map((segment) => trimLeadingSeparators(segment))
    .filter(Boolean);

  return [normalizedBase, ...normalizedSegments].join(separator);
};

const getRelativePathFromRoot = (absolutePath: string, rootPath: string) => {
  const normalizedAbsolutePath = trimTrailingSeparators(
    stripWindowsExtendedLengthPathPrefix(absolutePath).replace(/[\\/]+/g, '/')
  );
  const normalizedRootPath = trimTrailingSeparators(
    stripWindowsExtendedLengthPathPrefix(rootPath).replace(/[\\/]+/g, '/')
  );

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

const normalizeAbsolutePathForComparison = (value: string) => {
  const normalized = value.replace(/[\\/]+/g, '/').replace(/\/+$/g, '');
  return usesWindowsPathSemantics(value) ? normalized.toLowerCase() : normalized;
};

const buildOperationId = (type: ProjectFileOperationType, targetPath: string, index: number) =>
  `${type}:${targetPath}:${index}`;

const resolveToolTargetPath = (input: Record<string, unknown>) => {
  const candidate = input.file_path ?? input.path ?? input.file;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : '';
};

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

export const isSupportedProjectTextFilePath = (value: string) => value.trim().length > 0;

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

export const isProjectFileWriteAccessFailure = (value: string) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return Boolean(normalized && PROJECT_FILE_WRITE_ACCESS_FAILURE_PATTERN.test(normalized));
};

export const buildProjectFileOperationFromToolCall = (input: {
  toolName: string;
  toolInput: Record<string, unknown>;
  fileExists?: boolean | null;
  index?: number;
}): ProjectFileOperation | null => {
  const targetPath = resolveToolTargetPath(input.toolInput);
  if (!targetPath) {
    return null;
  }

  const index = typeof input.index === 'number' ? input.index : 0;

  if (input.toolName === 'write') {
    const content = typeof input.toolInput.content === 'string' ? input.toolInput.content : null;
    if (content === null) {
      return null;
    }

    const type: ProjectFileOperationType = input.fileExists === false ? 'create_file' : 'edit_file';
    return {
      id: buildOperationId(type, targetPath, index),
      type,
      targetPath,
      summary: type === 'create_file' ? `创建 ${targetPath}` : `写入 ${targetPath}`,
      content,
    };
  }

  if (input.toolName === 'edit') {
    const oldString = typeof input.toolInput.old_string === 'string' ? input.toolInput.old_string : null;
    const newString = typeof input.toolInput.new_string === 'string' ? input.toolInput.new_string : null;

    if (oldString !== null && newString !== null) {
      return {
        id: buildOperationId('edit_file', targetPath, index),
        type: 'edit_file',
        targetPath,
        summary: `编辑 ${targetPath}`,
        oldString,
        newString,
      };
    }

    const content = typeof input.toolInput.content === 'string' ? input.toolInput.content : null;
    if (content === null) {
      return null;
    }

    return {
      id: buildOperationId('edit_file', targetPath, index),
      type: 'edit_file',
      targetPath,
      summary: `写入 ${targetPath}`,
      content,
    };
  }

  return null;
};
