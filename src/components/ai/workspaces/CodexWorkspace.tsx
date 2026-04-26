import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudianChatPage } from '../claudian-shell/ClaudianChatPage';
import { PlatformCapabilityStrip } from '../provider-chat/PlatformCapabilityStrip';
import { ProviderWorkspaceLayout } from './ProviderWorkspaceLayout';

export const CodexWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'full-page', localSnapshot = null }) => (
  <section className={`provider-workspace provider-workspace-codex provider-workspace-${mode}`}>
    <ProviderWorkspaceLayout
      sidebar={<div>Codex sessions will move here.</div>}
      status={<div>Codex runtime summary and binding remain active below.</div>}
      messages={<ClaudianChatPage providerId="codex" mode={mode} localSnapshot={localSnapshot} />}
      composer={
        <>
          <PlatformCapabilityStrip providerId="codex" />
          <div>Codex provider tools and shared capabilities will mount here.</div>
        </>
      }
    />
  </section>
);
