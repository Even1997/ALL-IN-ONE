// 文件作用：页面组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useGNAgentWorkbenchSession } from '../../../components/ai/gn-agent-shell/useGNAgentWorkbenchSession';
import { MacDialog } from '../../../components/ui/MacDialog';
import { useKnowledgeStore } from '../../../features/knowledge/store/knowledgeStore';
import { buildKnowledgeSearchIndex, searchKnowledgeEntries } from '../../../modules/knowledge/knowledgeSearch';
import { useProjectStore } from '../../../store/projectStore';
import { LAYOUT_PREFERENCE_KEYS, readLayoutSize, writeLayoutSize } from '../../../utils/layoutPreferences';
import { AgentChatStage } from '../components/AgentChatStage';
import { AgentUtilitySidebar, hasAgentReviewContent } from '../components/AgentUtilitySidebar';
import { AgentWorkbenchLayout } from '../components/AgentWorkbenchLayout';
import { AgentWorkbenchSidebar } from '../components/AgentWorkbenchSidebar';
import './AgentShellPage.css';

const AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS = { min: 240, max: 420 };
const AGENT_SIDEBAR_DEFAULT_PANEL_WIDTH = 304;

const clampAgentSidebarPanelWidth = (value: number) =>
  Math.min(AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS.max, Math.max(AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS.min, value));

export const AgentShellPage: React.FC = () => {
  const session = useGNAgentWorkbenchSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPanelWidth, setSidebarPanelWidth] = useState(() =>
    readLayoutSize(
      LAYOUT_PREFERENCE_KEYS.agentWorkbenchSidebarWidth,
      AGENT_SIDEBAR_DEFAULT_PANEL_WIDTH,
      AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS,
    ),
  );
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [utilitySidebarCollapsed, setUtilitySidebarCollapsed] = useState(true);
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

  const showUtilitySidebar = hasAgentReviewContent(session);

  const persistSidebarPanelWidth = useCallback((value: number) => {
    setSidebarPanelWidth(
      writeLayoutSize(
        LAYOUT_PREFERENCE_KEYS.agentWorkbenchSidebarWidth,
        value,
        AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS,
      ),
    );
  }, []);

  const handleSidebarResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = sidebarPanelWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      setIsSidebarResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setSidebarPanelWidth(clampAgentSidebarPanelWidth(startWidth + moveEvent.clientX - startX));
      };

      const handlePointerUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        setIsSidebarResizing(false);
        setSidebarPanelWidth((current) =>
          writeLayoutSize(
            LAYOUT_PREFERENCE_KEYS.agentWorkbenchSidebarWidth,
            current,
            AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS,
          ),
        );
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [sidebarPanelWidth],
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
        return;
      }

      event.preventDefault();

      persistSidebarPanelWidth(
        event.key === 'Home'
          ? AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS.min
          : event.key === 'End'
            ? AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS.max
            : clampAgentSidebarPanelWidth(sidebarPanelWidth + (event.key === 'ArrowRight' ? 16 : -16)),
      );
    },
    [persistSidebarPanelWidth, sidebarPanelWidth],
  );

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
            panelWidth={sidebarPanelWidth}
          />
        }
        centerStage={
          <AgentChatStage
            mode="full"
            session={session}
            projectName={session.currentProjectName}
          />
        }
        sidebarCollapsed={sidebarCollapsed}
        sidebarWidth={sidebarPanelWidth}
        sidebarWidthBounds={AGENT_SIDEBAR_PANEL_WIDTH_BOUNDS}
        sidebarResizing={isSidebarResizing}
        onSidebarResizePointerDown={handleSidebarResizePointerDown}
        onSidebarResizeKeyDown={handleSidebarResizeKeyDown}
        companion={
          showUtilitySidebar ? (
            <AgentUtilitySidebar
              session={session}
              collapsed={utilitySidebarCollapsed}
              onToggleCollapsed={() => setUtilitySidebarCollapsed((value) => !value)}
            />
          ) : undefined
        }
        companionCollapsed={showUtilitySidebar ? utilitySidebarCollapsed : false}
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
            <p className="agent-workbench-search-empty">正在加载项目文档…</p>
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
