import React from 'react';
import { AIChat } from '../workspace/AIChat';

export const GNAgentWorkspace: React.FC = () => (
  <section className="gn-agent-workspace">
    <AIChat variant="gn-agent-embedded" />
  </section>
);
