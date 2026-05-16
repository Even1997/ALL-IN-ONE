// 文件作用：布局组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import { ComposerToolbar } from '../provider-chat/ComposerToolbar';
import { MessageViewport } from '../provider-chat/MessageViewport';
import { RuntimeStatusBar } from '../provider-chat/RuntimeStatusBar';
import { SessionSidebar } from '../provider-chat/SessionSidebar';
import '../provider-chat/providerChat.css';
import './ProviderWorkspaceLayout.css';

export const ProviderWorkspaceLayout: React.FC<{
  sidebar: React.ReactNode;
  status: React.ReactNode;
  messages: React.ReactNode;
  composer: React.ReactNode;
}> = ({ sidebar, status, messages, composer }) => (
  <section className="provider-workspace-layout">
    <SessionSidebar providerLabel="Sessions">{sidebar}</SessionSidebar>
    <div className="provider-workspace-main">
      <RuntimeStatusBar>{status}</RuntimeStatusBar>
      <MessageViewport>{messages}</MessageViewport>
      <ComposerToolbar>{composer}</ComposerToolbar>
    </div>
  </section>
);
