import type {
  CanonicalEvent,
  CanonicalFileChange,
  ToolCompletedPayload,
} from '@goodnight/runtime-protocol';
import {
  getTimelineRunStartSummary,
  getTimelineToolDisplayName,
  summarizeTimelineToolStarted,
} from '../../../modules/ai/runtime/composer/timelinePresentation.ts';

export type TimelineDetailTone = 'default' | 'success' | 'warning' | 'error';

export type TimelineDetailItem = {
  key: string;
  label: string;
  value?: string;
  tone?: TimelineDetailTone;
  mono?: boolean;
};

const summarizePath = (value: string) => {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length <= 3) {
    return normalized;
  }

  return `.../${parts.slice(-3).join('/')}`;
};

const summarizeValue = (value: string | null | undefined, maxLength = 320) => {
  const normalized = (value || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const getFileOperationLabel = (change: CanonicalFileChange) => {
  if (change.beforeContent === null && change.afterContent !== null) {
    return 'Created';
  }
  if (change.beforeContent !== null && change.afterContent === null) {
    return 'Deleted';
  }
  return change.operation === 'write' ? 'Wrote' : 'Edited';
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
    label: payload.ok ? 'Completed' : 'Failed',
    value: summary || outputText || getTimelineToolDisplayName(event.source.name || 'tool'),
    tone: payload.ok ? 'success' : 'error',
  });

  if (typeof payload.exitCode === 'number') {
    items.push({
      key: `${event.eventId}:exitCode`,
      label: 'Exit code',
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
      label: 'Output',
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
          value: getTimelineRunStartSummary(event.payload) || 'started',
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
          value: summaryParts.join(' - '),
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
          label: getTimelineToolDisplayName(event.payload.toolName),
          value: summarizeTimelineToolStarted(event.payload),
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
          label: 'Approval needed',
          value: summarizeValue(event.payload.summary),
          tone: 'warning',
        });
        break;
      case 'approval.resolved':
        items.push({
          key: event.eventId,
          label: event.payload.resolution === 'approved' ? 'Approved' : 'Denied',
          tone: event.payload.resolution === 'approved' ? 'success' : 'warning',
        });
        break;
      case 'question.requested':
        for (const [index, question] of event.payload.questions.entries()) {
          items.push({
            key: `${event.eventId}:question:${index}`,
            label: 'Input needed',
            value: summarizeValue(question.question),
            tone: 'warning',
          });
        }
        break;
      case 'question.answered':
        items.push({
          key: event.eventId,
          label: 'Input received',
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
          label: `Retry #${event.payload.attempt}`,
          value: summarizeValue(event.payload.reason),
          tone: 'warning',
        });
        break;
      case 'warning.raised':
        items.push({
          key: event.eventId,
          label: 'Warning',
          value: summarizeValue(event.payload.summary),
          tone: 'warning',
        });
        break;
      case 'error.raised':
        items.push({
          key: event.eventId,
          label: 'Error',
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
