import React, { useState } from 'react';
import { useGNAgentWorkbenchSession } from '../../../components/ai/gn-agent-shell/useGNAgentWorkbenchSession';
import { AgentChatStage } from '../components/AgentChatStage';
import { AgentFloatingPlanCard } from '../components/AgentFloatingPlanCard';
import { AgentWorkbenchInspector, type AgentInspectorTab } from '../components/AgentWorkbenchInspector';
import { AgentWorkbenchLayout } from '../components/AgentWorkbenchLayout';
import { AgentWorkbenchSidebar, type AgentSidebarMode } from '../components/AgentWorkbenchSidebar';
import './AgentShellPage.css';

export const AgentShellPage: React.FC = () => {
  const session = useGNAgentWorkbenchSession();
  const [sidebarMode, setSidebarMode] = useState<AgentSidebarMode>('threads');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<AgentInspectorTab>('review');
  const [floatingPlanCollapsed, setFloatingPlanCollapsed] = useState(false);

  return (
    <section className="agent-workspace-page">
      <AgentWorkbenchLayout
        sidebar={
          <AgentWorkbenchSidebar
            mode={sidebarMode}
            onModeChange={setSidebarMode}
            projectName={session.currentProjectName}
            threads={session.threads}
            activeSessionId={session.activeSessionId}
            recoveryByThread={session.recoveryByThread}
            onSelectThread={session.statusActions.selectThread}
            onResumeThread={session.statusActions.resumeThread}
            onNewThread={session.statusActions.createThread}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          />
        }
        centerStage={
          <AgentChatStage
            providerId="classic"
            mode="full"
            session={session}
            projectName={session.currentProjectName}
            inspectorOpen={!inspectorCollapsed}
            onToggleInspector={() => setInspectorCollapsed((value) => !value)}
          />
        }
        floatingOverlay={
          <AgentFloatingPlanCard
            session={session.latestTurnSession}
            collapsed={floatingPlanCollapsed}
            onToggleCollapsed={() => setFloatingPlanCollapsed((value) => !value)}
            onOpenInspector={() => {
              setInspectorCollapsed(false);
              setInspectorTab('review');
            }}
          />
        }
        rightInspector={
          <AgentWorkbenchInspector
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            latestTurnSession={session.latestTurnSession}
            contextSnapshot={session.contextSnapshot}
            toolCalls={session.toolCalls}
            mcpToolCalls={session.mcpToolCalls}
            memoryCandidates={session.memoryCandidates}
          />
        }
        inspectorCollapsed={inspectorCollapsed}
      />
    </section>
  );
};
