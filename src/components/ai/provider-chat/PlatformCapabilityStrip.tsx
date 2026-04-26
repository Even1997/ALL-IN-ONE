import React from 'react';

export const PlatformCapabilityStrip: React.FC<{
  providerId: 'claude' | 'codex';
}> = ({ providerId }) => (
  <div className={`platform-capability-strip platform-capability-strip-${providerId}`}>
    <span>Skills</span>
    <span>Context</span>
    <span>Workspace</span>
    <span>Activity</span>
  </div>
);
