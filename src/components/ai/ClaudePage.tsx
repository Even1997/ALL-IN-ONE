import React from 'react';
import { ClaudianShell } from './claudian-shell/ClaudianShell';
import './ClaudePage.css';

export const ClaudePage: React.FC = () => (
  <section className="claude-page">
    <ClaudianShell mode="full-page" />
  </section>
);
