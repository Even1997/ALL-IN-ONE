// 文件作用：承接 Agent 工作台主舞台里的聊天区与空线程占位态。
// 所在链路：Agent shell UI composition。
// 排查入口：先看 `showEmptyState` 的判定，再看 `AIChat` 的 embedded 渲染与外层容器类名。
import React from 'react';
import type { GNAgentWorkbenchSession } from '../../../components/ai/gn-agent-shell/useGNAgentWorkbenchSession';
import { WorkbenchIcon } from '../../../components/ui/WorkbenchIcon';
import { AIChat } from '../../../components/workspace/AIChat';
import './agentWorkbench.css';

type AgentChatStageProps = {
  mode: 'full' | 'stage-plus' | 'stage-only';
  session: GNAgentWorkbenchSession;
  projectName?: string | null;
};

export const AgentChatStage: React.FC<AgentChatStageProps> = ({
  mode,
  session,
}) => {
  const messages = session.activeSession?.messages || [];
  const showEmptyState = !messages.some((message) => message.role === 'user' || message.role === 'system');

  return (
    <section className={`agent-chat-stage agent-chat-stage-${mode} gn-agent-workspace${showEmptyState ? ' is-empty-thread' : ''}`}>
      <div className="agent-chat-stage-body">
        <AIChat
          variant="embedded"
          showHeaderChrome={false}
        />
        {showEmptyState ? (
          <div className="agent-chat-stage-empty" aria-hidden="true">
            <span className="agent-chat-stage-empty-icon">
              <WorkbenchIcon name="spark" />
            </span>
            <strong>准备一个新的 Agent 对话</strong>
            <p>先输入目标、上下文或待处理文件，让 Agent 在当前工作台里开始一次完整的执行链路。</p>
            <div className="agent-chat-stage-empty-steps">
              <span>描述任务目标</span>
              <span>补充约束与上下文</span>
              <span>开始执行与追踪</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
