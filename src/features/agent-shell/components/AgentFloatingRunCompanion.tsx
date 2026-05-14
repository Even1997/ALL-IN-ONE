import React, { useMemo } from 'react';
import type { GNAgentWorkbenchSession } from '../../../components/ai/gn-agent-shell/useGNAgentWorkbenchSession';
import { FloatingRunCompanion, StateCard } from '../../../components/ui';

type AgentFloatingRunCompanionProps = {
  session: GNAgentWorkbenchSession;
};

const formatStatusLabel = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const AgentFloatingRunCompanion: React.FC<AgentFloatingRunCompanionProps> = ({ session }) => {
  const latestTurn = session.latestTurnSession;

  const affectedPaths = useMemo(() => {
    const pathSet = new Set<string>(latestTurn?.plan?.affectedPaths || []);

    for (const toolCall of session.toolCalls) {
      for (const fileChange of toolCall.fileChanges || []) {
        pathSet.add(fileChange.path);
      }
    }

    return [...pathSet].slice(0, 4);
  }, [latestTurn?.plan?.affectedPaths, session.toolCalls]);

  const visibleSteps = useMemo(() => {
    if (!latestTurn) {
      return [];
    }

    if (latestTurn.executionSteps.length > 0) {
      return latestTurn.executionSteps.slice(0, 4).map((step, index) => ({
        id: step.id || `execution-${index}`,
        title: step.title,
        summary: step.userVisibleDetail || step.resultSummary || 'Waiting for the next update.',
        status: step.status,
      }));
    }

    return (latestTurn.plan?.steps || []).slice(0, 4).map((step, index) => ({
      id: step.id || `plan-${index}`,
      title: step.title,
      summary: step.summary || step.expectedResult,
      status: latestTurn.status === 'planning' ? 'running' : 'pending',
    }));
  }, [latestTurn]);

  const hasContent = Boolean(
    latestTurn
      && (
        latestTurn.plan
        || latestTurn.executionSteps.length
        || latestTurn.resumeSnapshot
        || session.pendingApprovalCount
        || affectedPaths.length
      ),
  );

  if (!hasContent || !latestTurn) {
    return null;
  }

  const tone =
    latestTurn.status === 'failed'
      ? 'danger'
      : latestTurn.status === 'blocked' || latestTurn.status === 'waiting_approval'
        ? 'warning'
        : latestTurn.status === 'completed'
          ? 'success'
          : 'info';

  return (
    <FloatingRunCompanion
      className="agent-floating-run-companion"
      title="Current run"
      subtitle={latestTurn.plan?.summary || latestTurn.userPrompt || 'Active turn'}
      icon="spark"
      meta={(
        <span className={`agent-floating-run-status is-${latestTurn.status}`}>
          {formatStatusLabel(latestTurn.status)}
        </span>
      )}
    >
      <StateCard
        className="agent-floating-run-card"
        title={latestTurn.plan?.reason || 'Working through the current task.'}
        description={
          latestTurn.resumeSnapshot?.resumeReason
            || (session.pendingApprovalCount > 0
              ? `Waiting for ${session.pendingApprovalCount} approval${session.pendingApprovalCount > 1 ? 's' : ''}.`
              : latestTurn.plan?.summary)
        }
        icon={
          latestTurn.status === 'failed'
            ? 'alertTriangle'
            : latestTurn.status === 'completed'
              ? 'checkCircle'
              : latestTurn.status === 'blocked' || latestTurn.status === 'waiting_approval'
                ? 'clock'
                : 'spark'
        }
        tone={tone}
        state={
          latestTurn.status === 'failed'
            ? 'error'
            : latestTurn.status === 'waiting_approval'
              ? 'confirm'
              : latestTurn.status === 'completed'
                ? 'selected'
                : 'default'
        }
        meta={latestTurn.plan?.riskLevel ? `${latestTurn.plan.riskLevel} risk` : undefined}
      />

      {visibleSteps.length > 0 ? (
        <section className="agent-floating-run-block">
          <div className="agent-floating-run-block-head">
            <strong>Steps</strong>
            <span>{visibleSteps.length}</span>
          </div>
          <div className="agent-floating-run-list">
            {visibleSteps.map((step, index) => (
              <article key={step.id} className={`agent-floating-run-row is-${step.status}`}>
                <span className="agent-floating-run-index">{index + 1}</span>
                <div className="agent-floating-run-copy">
                  <strong>{step.title}</strong>
                  <span>{step.summary}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {affectedPaths.length > 0 ? (
        <section className="agent-floating-run-block">
          <div className="agent-floating-run-block-head">
            <strong>Files</strong>
            <span>{affectedPaths.length}</span>
          </div>
          <div className="agent-floating-run-files">
            {affectedPaths.map((path) => (
              <span key={path}>{path.split(/[\\/]/).pop() || path}</span>
            ))}
          </div>
        </section>
      ) : null}
    </FloatingRunCompanion>
  );
};
