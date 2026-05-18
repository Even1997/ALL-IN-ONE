// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AIChat } from '../workspace/AIChat';
import { useProjectStore } from '../../store/projectStore';
import './AIWorkspace.css';

type AIWorkspaceProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export const AIWorkspace: React.FC<AIWorkspaceProps> = ({ collapsed, onCollapsedChange }) => {
  const { currentProject } = useProjectStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
    }))
  );

  if (!currentProject) {
    return null;
  }

  return (
    <section className="floating-ai-workspace gn-agent-workspace">
      <div className="ai-workspace-shell">
        <div className="ai-workspace-body">
          <AIChat variant="embedded" collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
        </div>
      </div>
    </section>
  );
};

