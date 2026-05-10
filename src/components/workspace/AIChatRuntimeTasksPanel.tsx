import React from 'react';
import { useActiveConversationTasks } from '../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import type { AgentTeamRunRecord } from '../../modules/ai/runtime/teams/teamTypes';

type AIChatRuntimeTasksPanelProps = {
  projectId: string | null;
};

export const AIChatRuntimeTasksPanel = React.memo(function AIChatRuntimeTasksPanel({
  projectId,
}: AIChatRuntimeTasksPanelProps) {
  const { backgroundTasks } = useActiveConversationTasks({ projectId });

  if (backgroundTasks.length === 0) {
    return null;
  }

  return (
    <section className="chat-runtime-task-strip" aria-label="Runtime tasks">
      {backgroundTasks.slice(0, 3).map((task) => {
        let progressLabel = task.status;

        if (task.runKind === 'team') {
          try {
            const teamRun = JSON.parse(task.payloadJson) as AgentTeamRunRecord;
            const completedCount = teamRun.members.filter((member) => member.status === 'completed').length;
            progressLabel = `${completedCount}/${teamRun.members.length}`;
          } catch {
            progressLabel = task.status;
          }
        }

        const tone =
          task.status === 'failed'
            ? 'error'
            : task.status === 'completed'
              ? 'success'
              : task.status === 'running' || task.status === 'planning'
                ? 'running'
                : '';

        return (
          <article key={task.id} className={`chat-runtime-task-chip ${tone}`.trim()}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.summary || task.runKind}</span>
            </div>
            <code>{progressLabel}</code>
          </article>
        );
      })}
    </section>
  );
});
