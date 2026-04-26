import React from 'react';
import type { LocalAgentConfigSnapshot } from '../../../modules/ai/claudian/localConfig';
import { ClaudianChatPage } from '../claudian-shell/ClaudianChatPage';
import { PlatformCapabilityStrip } from '../provider-chat/PlatformCapabilityStrip';
import { ProviderWorkspaceLayout } from './ProviderWorkspaceLayout';

export const ClaudeWorkspace: React.FC<{
  mode?: 'panel' | 'full-page';
  localSnapshot?: LocalAgentConfigSnapshot | null;
}> = ({ mode = 'full-page', localSnapshot = null }) => (
  <section className={`provider-workspace provider-workspace-claude provider-workspace-${mode}`}>
    <ProviderWorkspaceLayout
      sidebar={<div>Claude sessions will move here.</div>}
      status={<div>Claude runtime summary and binding remain active below.</div>}
      messages={<ClaudianChatPage providerId="claude" mode={mode} localSnapshot={localSnapshot} />}
      composer={
        <>
          <PlatformCapabilityStrip providerId="claude" />
          <div>Claude provider tools and shared capabilities will mount here.</div>
        </>
      }
    />
  </section>
);
