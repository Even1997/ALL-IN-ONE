import type {
  CanonicalEvent,
  ProgressUpdatedPayload,
  RunCompletedPayload,
  RunStartedPayload,
  ToolCompletedPayload,
  ToolStartedPayload,
} from '@goodnight/runtime-protocol';
import type {
  TimelineCard,
  TimelineCardStatus,
  TimelineComposer,
  TimelinePhase,
  TimelineProjection,
} from './timelineComposerTypes.ts';
import {
  getTimelineRunStartSummary,
  getTimelineToolDisplayName,
  summarizeTimelineToolStarted,
} from './timelinePresentation.ts';

const createCard = (
  event: CanonicalEvent,
  phase: TimelinePhase,
  title: string,
  summary = title,
): TimelineCard => ({
  cardId: `card_${event.eventId}`,
  phase,
  title,
  summary,
  status: 'running',
  startedAt: event.ts,
  toolCount: 0,
  retryCount: 0,
  warningCount: 0,
  errorCount: 0,
  detailRefs: [],
  interactionRefs: [],
});

const summarizeText = (value: string | null | undefined, maxLength = 160) => {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
    : normalized;
};

const getToolStartedSummary = (payload: ToolStartedPayload) =>
  summarizeTimelineToolStarted(payload) ||
  payload.displayName?.trim() ||
  payload.toolName;

const getToolStartedCardTitle = (payload: ToolStartedPayload) =>
  payload.displayName?.trim() ||
  getTimelineToolDisplayName(payload.toolName);

const getToolCompletedCardTitle = (event: Extract<CanonicalEvent, { type: 'tool.completed' }>) =>
  getTimelineToolDisplayName(event.source.name || 'tool');

const getToolCompletedSummary = (payload: ToolCompletedPayload) =>
  payload.summary?.trim() ||
  payload.outputText?.trim() ||
  (payload.ok ? 'Tool run completed' : 'Tool run failed');

const getProgressSummary = (payload: ProgressUpdatedPayload) =>
  payload.detail?.trim() ? `${payload.label}: ${payload.detail}` : payload.label;

const getRunStartedSummary = (payload: RunStartedPayload) =>
  getTimelineRunStartSummary(payload) || 'Run started';

const getRunCompletedSummary = (payload: RunCompletedPayload) => {
  const segments = [
    payload.summary?.trim() || `Outcome: ${payload.outcome}`,
  ];

  if (typeof payload.tokenUsage?.totalTokens === 'number') {
    segments.push(`tokens: ${payload.tokenUsage.totalTokens}`);
  }

  return segments.join(' • ');
};

const getMessageStartedSummary = () => 'Generating assistant reply';

const getReasoningSummary = (value: string) =>
  summarizeText(value) || 'Reasoning';

const getMessageDeltaSummary = (value: string) =>
  summarizeText(value) || 'Generating assistant reply';

const getMessageCompletedSummary = (value: string) =>
  summarizeText(value) || 'Final answer ready';

const getCompletionStatus = (payload: ToolCompletedPayload): TimelineCardStatus =>
  payload.ok ? 'completed' : 'failed';

const getRunOutcomeStatus = (
  outcome: RunCompletedPayload['outcome'],
): TimelineCardStatus => {
  if (outcome === 'success') {
    return 'completed';
  }

  if (outcome === 'cancelled') {
    return 'cancelled';
  }

  return 'failed';
};

export const createTimelineComposer = (input: { runId: string }): TimelineComposer => {
  const projection: TimelineProjection = {
    runId: input.runId,
    status: 'running',
    cards: [],
    activeMessage: null,
    finalMessage: null,
    events: [],
  };

  let runCardId: string | null = null;
  let responseCardId: string | null = null;

  const getCardById = (cardId: string | null) =>
    projection.cards.find((card) => card.cardId === cardId) || null;

  const ensureLastCard = (
    event: CanonicalEvent,
    phase: TimelinePhase,
    title: string,
    summary = title,
  ) => {
    const last = projection.cards[projection.cards.length - 1];
    if (last && last.phase === phase && last.status === 'running') {
      return last;
    }

    const next = createCard(event, phase, title, summary);
    projection.cards.push(next);
    return next;
  };

  const ensureRunCard = (event: CanonicalEvent, summary?: string) => {
    const existing = getCardById(runCardId);
    if (existing) {
      if (summary) {
        existing.summary = summary;
      }
      return existing;
    }

    const next = createCard(event, 'intake', 'Run', summary || 'Run started');
    projection.cards.push(next);
    runCardId = next.cardId;
    return next;
  };

  const ensureResponseCard = (event: CanonicalEvent, summary?: string) => {
    const existing = getCardById(responseCardId);
    if (existing) {
      if (summary) {
        existing.summary = summary;
      }
      return existing;
    }

    const next = createCard(
      event,
      'response',
      'Response',
      summary || getMessageStartedSummary(),
    );
    projection.cards.push(next);
    responseCardId = next.cardId;
    return next;
  };

  const finalizeCard = (
    card: TimelineCard,
    status: TimelineCardStatus,
    ts: number,
    summary?: string,
  ) => {
    card.status = status;
    card.endedAt = ts;
    if (summary) {
      card.summary = summary;
    }
  };

  const finalizeRunningCards = (status: TimelineCardStatus, ts: number) => {
    projection.cards.forEach((card) => {
      if (card.status !== 'running') {
        return;
      }

      card.status = status;
      card.endedAt = ts;
    });
  };

  const getActiveToolCard = () => {
    const last = projection.cards[projection.cards.length - 1];
    if (!last || last.status !== 'running') {
      return null;
    }

    return last.phase === 'tooling' || last.phase === 'error' ? last : null;
  };

  return {
    append(event) {
      projection.events.push(event);

      switch (event.type) {
        case 'run.started': {
          const summary = getRunStartedSummary(event.payload);
          const card = ensureRunCard(event, summary);
          card.summary = summary;
          card.status = 'running';
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'progress.updated': {
          const summary = getProgressSummary(event.payload);
          const card = ensureLastCard(event, 'analysis', event.payload.label, summary);
          card.summary = summary;
          card.progressLabel = event.payload.label;
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'reasoning.started': {
          const card = ensureLastCard(event, 'analysis', 'Reasoning', event.payload.summary || 'Reasoning');
          card.summary = event.payload.summary || 'Reasoning';
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'reasoning.delta': {
          const summary = getReasoningSummary(event.payload.textChunk);
          const card = ensureLastCard(event, 'analysis', 'Reasoning', summary);
          card.summary = summary;
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'reasoning.completed': {
          const summary = getReasoningSummary(event.payload.summary || event.payload.finalText || '');
          const card = ensureLastCard(event, 'analysis', 'Reasoning', summary);
          finalizeCard(card, 'completed', event.ts, summary);
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'tool.started': {
          const summary = getToolStartedSummary(event.payload);
          const title = getToolStartedCardTitle(event.payload);
          const last = projection.cards[projection.cards.length - 1];
          const card =
            last &&
            last.phase === 'analysis' &&
            last.status === 'running' &&
            last.toolCount === 0 &&
            last.errorCount === 0 &&
            last.warningCount === 0 &&
            last.retryCount === 0
              ? last
              : ensureLastCard(event, 'tooling', title, summary);
          card.phase = 'tooling';
          card.title = title;
          card.summary = summary;
          card.toolCount += 1;
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'tool.stdout':
        case 'tool.stderr': {
          const card = getActiveToolCard() || ensureLastCard(event, 'tooling', 'Tool');
          if (event.type === 'tool.stderr') {
            card.warningCount += 1;
          }
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'tool.completed': {
          const summary = getToolCompletedSummary(event.payload);
          const title = getToolCompletedCardTitle(event);
          const activeCard = getActiveToolCard();
          const card = ensureLastCard(
            event,
            event.payload.ok ? 'tooling' : 'error',
            activeCard?.title || title,
            summary,
          );
          card.title = activeCard?.title || title;
          card.summary = summary;
          card.status = getCompletionStatus(event.payload);
          card.endedAt = event.ts;
          card.detailRefs.push(event.eventId);
          if (!event.payload.ok) {
            card.errorCount += 1;
          }
          return;
        }

        case 'approval.requested': {
          const card = ensureLastCard(event, 'approval', 'Approval needed', event.payload.summary);
          card.summary = event.payload.summary;
          card.status = 'blocked';
          card.interactionRefs.push(event.payload.approvalId);
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'approval.resolved': {
          const card = ensureLastCard(event, 'approval', 'Approval resolved');
          card.status = event.payload.resolution === 'approved' ? 'completed' : 'failed';
          card.endedAt = event.ts;
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'question.requested': {
          const summary = event.payload.questions[0]?.question || 'Waiting for input';
          const card = ensureLastCard(event, 'question', 'Input needed', summary);
          card.summary = summary;
          card.status = 'blocked';
          card.interactionRefs.push(event.payload.questionId);
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'question.answered': {
          const card = ensureLastCard(event, 'question', 'Input received');
          card.status = 'completed';
          card.endedAt = event.ts;
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'retry.scheduled': {
          const card = ensureLastCard(event, 'analysis', 'Retry scheduled', event.payload.reason);
          card.summary = event.payload.reason;
          card.retryCount += 1;
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'warning.raised': {
          const card = ensureLastCard(event, 'analysis', 'Runtime warning', event.payload.summary);
          card.summary = event.payload.summary;
          card.warningCount += 1;
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'error.raised': {
          const card = ensureLastCard(event, 'error', 'Runtime error', event.payload.summary);
          card.summary = event.payload.summary;
          card.status = 'failed';
          card.errorCount += 1;
          card.endedAt = event.ts;
          card.detailRefs.push(event.eventId);
          finalizeRunningCards('failed', event.ts);
          projection.status = 'failed';
          return;
        }

        case 'message.started': {
          if (event.payload.phase === 'commentary') {
            const card = ensureLastCard(event, 'analysis', 'Process update', getMessageStartedSummary());
            card.detailRefs.push(event.eventId);
            return;
          }

          projection.activeMessage = {
            messageId: event.messageId || `msg_${event.eventId}`,
            text: '',
            startedAt: event.ts,
            updatedAt: event.ts,
            isStreaming: true,
          };
          const card = ensureResponseCard(event, getMessageStartedSummary());
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'message.delta': {
          if (event.payload.phase === 'commentary') {
            const card = ensureLastCard(
              event,
              'analysis',
              'Process update',
              getMessageDeltaSummary(event.payload.textChunk),
            );
            card.detailRefs.push(event.eventId);
            return;
          }

          projection.activeMessage = projection.activeMessage || {
            messageId: event.messageId || `msg_${event.eventId}`,
            text: '',
            startedAt: event.ts,
            updatedAt: event.ts,
            isStreaming: true,
          };
          if (projection.activeMessage.text.length === 0) {
            projection.activeMessage.startedAt = event.ts;
          }
          projection.activeMessage.text += event.payload.textChunk;
          projection.activeMessage.updatedAt = event.ts;
          const card = ensureResponseCard(
            event,
            getMessageDeltaSummary(projection.activeMessage.text || event.payload.textChunk),
          );
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'message.completed': {
          if (event.payload.phase === 'commentary') {
            const card = ensureLastCard(
              event,
              'analysis',
              'Process update',
              getMessageCompletedSummary(event.payload.finalText),
            );
            finalizeCard(card, 'completed', event.ts, getMessageCompletedSummary(event.payload.finalText));
            card.detailRefs.push(event.eventId);
            return;
          }

          projection.finalMessage = {
            messageId: event.messageId || `msg_${event.eventId}`,
            text: event.payload.finalText,
            completedAt: event.ts,
          };
          projection.activeMessage = null;
          const card = ensureResponseCard(
            event,
            getMessageCompletedSummary(event.payload.finalText),
          );
          finalizeCard(
            card,
            'completed',
            event.ts,
            getMessageCompletedSummary(event.payload.finalText),
          );
          card.detailRefs.push(event.eventId);
          return;
        }

        case 'run.completed': {
          const status = getRunOutcomeStatus(event.payload.outcome);
          const summary = getRunCompletedSummary(event.payload);
          const card = ensureRunCard(event, summary);
          card.detailRefs.push(event.eventId);
          finalizeCard(card, status, event.ts, summary);
          finalizeRunningCards(status, event.ts);
          projection.status =
            event.payload.outcome === 'success'
              ? 'completed'
              : event.payload.outcome;
          return;
        }

        default:
          return;
      }
    },

    getProjection() {
      return projection;
    },
  };
};
