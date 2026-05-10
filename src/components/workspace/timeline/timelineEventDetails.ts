import type {
  CanonicalEvent,
  CanonicalFileChange,
  ToolCompletedPayload,
  ToolStartedPayload,
} from '@goodnight/runtime-protocol';

export type TimelineDetailTone = 'default' | 'success' | 'warning' | 'error';

export type TimelineDetailItem = {
  key: string;
  label: string;
  value?: string;
  tone?: TimelineDetailTone;
  mono?: boolean;
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  view: '读取',
  ls: '列目录',
  grep: '检索',
  glob: '匹配',
  memory_read: '加载记忆',
  write: '写入',
  edit: '编辑',
  bash: '命令',
  powershell: 'PowerShell',
  fetch: '抓取',
  agent: '多 Agent',
  project_file_flow: '处理文件请求',
  project_file_read: '读取项目文件',
  project_file_plan: '整理改动方案',
  project_file_apply: '应用文件改动',
  run_local_agent: '调用本地 Agent',
  run_agent_team: '协调多 Agent',
  team_phase: '执行阶段',
  team_member_task: '成员任务',
};

const summarizePath = (value: string) => {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length <= 3) {
    return normalized;
  }

  return `.../${parts.slice(-3).join('/')}`;
};

const summarizePathList = (paths: string[]) => {
  const normalizedPaths = paths
    .map((value) => summarizePath(value))
    .filter((value) => value.trim().length > 0);

  if (normalizedPaths.length <= 2) {
    return normalizedPaths.join('、');
  }

  return `${normalizedPaths.slice(0, 2).join('、')} 等 ${normalizedPaths.length} 项`;
};

const summarizeValue = (value: string | null | undefined, maxLength = 320) => {
  const normalized = (value || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const getToolDisplayName = (toolName: string) => TOOL_DISPLAY_NAMES[toolName] || toolName;

const getFileOperationLabel = (change: CanonicalFileChange) => {
  if (change.beforeContent === null && change.afterContent !== null) {
    return '新建';
  }
  if (change.beforeContent !== null && change.afterContent === null) {
    return '删除';
  }
  return change.operation === 'write' ? '写入' : '修改';
};

const summarizeToolStarted = (payload: ToolStartedPayload) => {
  if (payload.inputSummary?.trim()) {
    return payload.inputSummary.trim();
  }

  const input = payload.input || {};

  if (typeof input.command === 'string' && input.command.trim()) {
    return input.command.trim();
  }

  const filePathInput = input.file_path ?? input.path ?? input.file;
  if (typeof filePathInput === 'string' && filePathInput.trim()) {
    return summarizePath(filePathInput);
  }

  if (typeof input.url === 'string' && input.url.trim()) {
    return input.url.trim();
  }

  if (typeof input.pattern === 'string' && input.pattern.trim()) {
    return input.pattern.trim();
  }

  if (Array.isArray(input.paths) && input.paths.length > 0) {
    return summarizePathList(input.paths.map((value) => String(value)));
  }

  const json = JSON.stringify(input);
  return json === '{}' ? '' : summarizeValue(json);
};

const formatTokenUsage = (value: { totalTokens?: number } | undefined) =>
  typeof value?.totalTokens === 'number' ? `tokens: ${value.totalTokens}` : '';

const appendToolCompletedItems = (
  items: TimelineDetailItem[],
  event: Extract<CanonicalEvent, { type: 'tool.completed' }>,
  payload: ToolCompletedPayload,
) => {
  const summary = summarizeValue(payload.summary);
  const outputText = summarizeValue(payload.outputText);

  items.push({
    key: `${event.eventId}:status`,
    label: payload.ok ? '已完成' : '执行失败',
    value: summary || outputText || getToolDisplayName(event.source.name || 'tool'),
    tone: payload.ok ? 'success' : 'error',
  });

  if (typeof payload.exitCode === 'number') {
    items.push({
      key: `${event.eventId}:exitCode`,
      label: '退出码',
      value: String(payload.exitCode),
      tone: payload.ok ? 'default' : 'warning',
    });
  }

  for (const [index, fileChange] of (payload.fileChanges || []).entries()) {
    items.push({
      key: `${event.eventId}:file:${index}`,
      label: getFileOperationLabel(fileChange),
      value: summarizePath(fileChange.path),
    });
  }

  if (outputText && outputText !== summary) {
    items.push({
      key: `${event.eventId}:output`,
      label: '输出',
      value: outputText,
      tone: payload.ok ? 'default' : 'warning',
      mono: true,
    });
  }
};

export const buildTimelineDetailItems = (events: CanonicalEvent[]) => {
  const items: TimelineDetailItem[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'run.started':
        items.push({
          key: event.eventId,
          label: 'Run',
          value: [event.payload.providerId, event.payload.mode].filter(Boolean).join(' / ') || 'started',
        });
        break;
      case 'run.completed': {
        const summaryParts = [
          summarizeValue(event.payload.summary),
          `outcome: ${event.payload.outcome}`,
          formatTokenUsage(event.payload.tokenUsage),
        ].filter(Boolean);
        items.push({
          key: event.eventId,
          label: 'Run completed',
          value: summaryParts.join(' • '),
          tone:
            event.payload.outcome === 'success'
              ? 'success'
              : event.payload.outcome === 'cancelled'
                ? 'warning'
                : 'error',
        });
        break;
      }
      case 'message.started':
        items.push({
          key: event.eventId,
          label: 'Response',
          value: 'Generating assistant reply',
        });
        break;
      case 'message.delta':
        items.push({
          key: event.eventId,
          label: 'Draft',
          value: summarizeValue(event.payload.textChunk, 1200),
        });
        break;
      case 'message.completed':
        items.push({
          key: event.eventId,
          label: 'Final answer',
          value: summarizeValue(event.payload.finalText, 1200),
        });
        break;
      case 'progress.updated':
        items.push({
          key: event.eventId,
          label: event.payload.label,
          value: summarizeValue(event.payload.detail),
        });
        break;
      case 'tool.started':
        items.push({
          key: event.eventId,
          label: getToolDisplayName(event.payload.toolName),
          value: summarizeToolStarted(event.payload),
          mono: Boolean(event.payload.inputSummary?.includes('\n')),
        });
        break;
      case 'tool.stdout':
        items.push({
          key: event.eventId,
          label: 'stdout',
          value: summarizeValue(event.payload.chunk, 1200),
          mono: true,
        });
        break;
      case 'tool.stderr':
        items.push({
          key: event.eventId,
          label: 'stderr',
          value: summarizeValue(event.payload.chunk, 1200),
          tone: 'warning',
          mono: true,
        });
        break;
      case 'tool.completed':
        appendToolCompletedItems(items, event, event.payload);
        break;
      case 'approval.requested':
        items.push({
          key: event.eventId,
          label: '等待确认',
          value: summarizeValue(event.payload.summary),
          tone: 'warning',
        });
        break;
      case 'approval.resolved':
        items.push({
          key: event.eventId,
          label: event.payload.resolution === 'approved' ? '已批准' : '已拒绝',
          tone: event.payload.resolution === 'approved' ? 'success' : 'warning',
        });
        break;
      case 'question.requested':
        for (const [index, question] of event.payload.questions.entries()) {
          items.push({
            key: `${event.eventId}:question:${index}`,
            label: '等待输入',
            value: summarizeValue(question.question),
            tone: 'warning',
          });
        }
        break;
      case 'question.answered':
        items.push({
          key: event.eventId,
          label: '已提供输入',
          value: summarizeValue(
            Object.entries(event.payload.answers)
              .map(([key, value]) => `${key}: ${value}`)
              .join('\n'),
            1200,
          ),
          mono: true,
        });
        break;
      case 'retry.scheduled':
        items.push({
          key: event.eventId,
          label: `准备重试 #${event.payload.attempt}`,
          value: summarizeValue(event.payload.reason),
          tone: 'warning',
        });
        break;
      case 'warning.raised':
        items.push({
          key: event.eventId,
          label: '警告',
          value: summarizeValue(event.payload.summary),
          tone: 'warning',
        });
        break;
      case 'error.raised':
        items.push({
          key: event.eventId,
          label: '错误',
          value: summarizeValue(
            [event.payload.summary, event.payload.detail].filter(Boolean).join('\n'),
            1200,
          ),
          tone: 'error',
          mono: Boolean(event.payload.detail),
        });
        break;
      default:
        break;
    }
  }

  return items.filter((item) => item.label.trim().length > 0 || (item.value || '').trim().length > 0);
};
