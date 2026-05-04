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
  /(新建|创建|生成(?:一个)?文件|生成文档|写入|写到|保存|另存为|保存为|保存成|落盘|编辑|修改|更新|重写|替换|删除|移除|remove|delete|create|write|edit|update|save)/i;

const READ_INTENT_PATTERN =
  /(查看|读取|读一下|打开|列出|看看|搜索|查找|目录|文件内容|read|open|show|list|search|grep)/i;

const TASK_WRITE_VERB_PATTERN =
  /(修|修复|修改|重写|改写|编辑|更新|完善|整理|优化|补全|同步|改掉|fix|rewrite|refactor|update|edit|organize|sync)/i;

const TASK_WRITE_TARGET_PATTERN =
  /(文件|文档|代码|配置|项目|页面|组件|模块|README|PRD|docs[\\/]|src[\\/]|package\.json|tsconfig|\.md\b|\.tsx?\b|\.jsx?\b|\.json\b|\.ya?ml\b|\.css\b|\.html\b)/i;

const QUESTION_ONLY_PATTERN = /(^|\s)(为什么|怎么|如何|what|why|how|which)(\s|$)|\?/i;

const ANALYSIS_ONLY_PATTERN =
  /(总结|概要|分析|解释|说明|对比|比较|检查|review|summary|summarize|analyze|analysis|compare|explain|inspect)/i;

const SHORT_PENDING_ACTION_AFFIRMATIVE_PATTERN =
  /^(?:\u597d|\u597d\u7684|\u53ef\u4ee5|\u884c|\u884c\u7684|\u55ef|\u55ef\u55ef|\u786e\u8ba4|\u5bf9|\u662f|\u662f\u7684|ok|okay|yes|yep|sure|go ahead)[\s\u3002\uff01!.,，]*$/i;

const SHORT_PENDING_ACTION_NEGATIVE_PATTERN =
  /^(?:\u4e0d|\u4e0d\u8981|\u4e0d\u7528|\u5148\u4e0d|\u7b97\u4e86|\u53d6\u6d88|no|nope|cancel)[\s\u3002\uff01!.,，]*$/i;

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
    throw new Error('AI 没有返回文件操作计划。');
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

  throw new Error('无法解析 AI 返回的文件操作计划。');
};

export const isSupportedProjectTextFilePath = (value: string) =>
  SUPPORTED_TEXT_FILE_EXTENSIONS.has(extractExtension(value));

export const detectProjectFileWriteIntent = (value: string) => WRITE_INTENT_PATTERN.test(value);

export const detectProjectFileReadIntent = (value: string) =>
  READ_INTENT_PATTERN.test(value) && !detectProjectFileWriteIntent(value);

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
    normalized.includes('修一下') ||
    normalized.includes('整理一下') ||
    normalized.includes('重写');
  const hasTaskTarget =
    TASK_WRITE_TARGET_PATTERN.test(normalized) ||
    normalizedLower.includes('readme') ||
    normalizedLower.includes('package.json') ||
    normalizedLower.includes('tsconfig') ||
    normalizedLower.includes('src/') ||
    normalizedLower.includes('docs/');

  if (
    (normalized.includes('整理一下') || normalized.includes('重写') || normalized.includes('修一下')) &&
    (normalizedLower.includes('readme') ||
      normalizedLower.includes('package.json') ||
      normalizedLower.includes('src/') ||
      normalizedLower.includes('docs/') ||
      normalized.includes('文档') ||
      normalized.includes('文件'))
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
    throw new Error('文件路径不能为空。');
  }

  if (!isAbsoluteFilePath(trimmedTargetPath)) {
    const normalizedRelativePath = normalizeRelativeFileSystemPath(trimmedTargetPath);
    const segments = normalizedRelativePath.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new Error('不能使用越界路径访问项目外部文件。');
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
    throw new Error('不能操作当前项目根目录之外的文件。');
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
