import React, { useEffect, useMemo, useState } from 'react';
import { useGNAgentWorkbenchSession } from '../../../components/ai/gn-agent-shell/useGNAgentWorkbenchSession';
import { MacDialog } from '../../../components/ui/MacDialog';
import { useKnowledgeStore } from '../../../features/knowledge/store/knowledgeStore';
import { buildKnowledgeSearchIndex, searchKnowledgeEntries } from '../../../modules/knowledge/knowledgeSearch';
import { useProjectStore } from '../../../store/projectStore';
import { AgentChatStage } from '../components/AgentChatStage';
import { AgentFloatingPlanCard } from '../components/AgentFloatingPlanCard';
import { AgentWorkbenchLayout } from '../components/AgentWorkbenchLayout';
import { AgentWorkbenchSidebar } from '../components/AgentWorkbenchSidebar';
import './AgentShellPage.css';

export const AgentShellPage: React.FC = () => {
  const session = useGNAgentWorkbenchSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [floatingPlanCollapsed, setFloatingPlanCollapsed] = useState(false);
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const notes = useKnowledgeStore((state) => state.notes);
  const notesError = useKnowledgeStore((state) => state.error);
  const isNotesLoading = useKnowledgeStore((state) => state.isLoading);
  const loadNotes = useKnowledgeStore((state) => state.loadNotes);
  const setActiveKnowledgeFileId = useProjectStore((state) => state.setActiveKnowledgeFileId);

  useEffect(() => {
    if (!isSearchDialogOpen || !session.currentProjectId) {
      return;
    }

    void loadNotes(session.currentProjectId);
  }, [isSearchDialogOpen, loadNotes, session.currentProjectId]);

  const knowledgeSearchState = useMemo(
    () =>
      buildKnowledgeSearchIndex(
        notes.map((note) => ({
          id: note.id,
          title: note.title,
          content: note.bodyMarkdown,
          summary: note.matchSnippet || note.sourceUrl || '',
        })),
      ),
    [notes],
  );
  const searchResults = useMemo(() => {
    const matches = searchKnowledgeEntries(knowledgeSearchState, searchQuery);

    return matches
      .map((entry) => notes.find((note) => note.id === entry.id) || null)
      .filter((note): note is (typeof notes)[number] => Boolean(note))
      .slice(0, 16);
  }, [knowledgeSearchState, notes, searchQuery]);

  return (
    <section className="agent-workspace-page">
      <AgentWorkbenchLayout
        sidebar={
          <AgentWorkbenchSidebar
            projectName={session.currentProjectName}
            sessions={session.sessions}
            activeSessionId={session.activeSessionId}
            onSelectThread={session.statusActions.selectThread}
            onDeleteSession={session.statusActions.deleteSession}
            onNewThread={session.statusActions.createThread}
            onOpenSearch={() => setIsSearchDialogOpen(true)}
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
          />
        }
        companion={
          <AgentFloatingPlanCard
            session={session.latestTurnSession}
            collapsed={floatingPlanCollapsed}
            onToggleCollapsed={() => setFloatingPlanCollapsed((value) => !value)}
          />
        }
      />

      <MacDialog
        open={isSearchDialogOpen}
        onOpenChange={(open) => {
          setIsSearchDialogOpen(open);
          if (!open) {
            setSearchQuery('');
          }
        }}
        title="搜索"
        description="搜索当前项目里的系统文档与知识笔记。"
        contentClassName="agent-workbench-dialog"
      >
        <div className="agent-workbench-search-dialog">
          <label className="agent-workbench-search-field">
            <span>关键词</span>
            <div className="agent-workbench-search-input">
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索项目文档、设计笔记或说明"
              />
            </div>
          </label>

          {!session.currentProjectId ? (
            <p className="agent-workbench-search-empty">当前还没有可搜索的项目文档。</p>
          ) : null}

          {session.currentProjectId && isNotesLoading ? (
            <p className="agent-workbench-search-empty">正在载入项目文档…</p>
          ) : null}

          {session.currentProjectId && !isNotesLoading && notesError ? (
            <p className="agent-workbench-search-empty">{notesError}</p>
          ) : null}

          {session.currentProjectId && !isNotesLoading && !notesError ? (
            <div className="agent-workbench-search-results">
              {searchResults.length > 0 ? (
                searchResults.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="agent-workbench-search-result"
                    onClick={() => {
                      setActiveKnowledgeFileId(note.id);
                      setIsSearchDialogOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <strong>{note.title}</strong>
                    <span>{note.sourceUrl || note.id}</span>
                    <p>{note.matchSnippet || '打开这个文档以继续查看内容。'}</p>
                  </button>
                ))
              ) : (
                <p className="agent-workbench-search-empty">没有匹配到文档，换个关键词试试。</p>
              )}
            </div>
          ) : null}
        </div>
      </MacDialog>
    </section>
  );
};
