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
