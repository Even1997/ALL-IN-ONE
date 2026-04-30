import React, { useEffect, useState } from 'react';
import {
  deleteLibrarySkill,
  discoverLocalSkills,
  importGitHubSkill,
  importLocalSkill,
  syncSkillToRuntime,
  type SkillDiscoveryEntry,
} from '../../../modules/ai/skills/skillLibrary';

const formatSourceBadge = (skill: SkillDiscoveryEntry) => {
  if (skill.builtin) {
    return 'Built-in';
  }

  return skill.source;
};

export const GNAgentSkillsPage: React.FC = () => {
  const [skills, setSkills] = useState<SkillDiscoveryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadSkills = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const entries = await discoverLocalSkills();
      setSkills(entries);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSkills();
  }, []);

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setIsWorking(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await action();
      setStatusMessage(successMessage);
      await loadSkills();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleImportLocal = async () => {
    const sourcePath = window.prompt('Import Local Skill: enter a local skill file or folder path.')?.trim();
    if (!sourcePath) {
      return;
    }

    await runAction(() => importLocalSkill(sourcePath), 'Local skill imported.');
  };

  const handleImportGitHub = async () => {
    const repo = window.prompt('Download from GitHub: enter owner/repo.')?.trim();
    if (!repo) {
      return;
    }

    const path = window.prompt('Download from GitHub: enter the skill path in that repo.')?.trim();
    if (!path) {
      return;
    }

    const gitRef = window.prompt('Optional git ref (branch, tag, or commit). Leave blank for main.')?.trim() || undefined;
    await runAction(() => importGitHubSkill({ repo, path, gitRef }), 'GitHub skill downloaded.');
  };

  const handleDeleteSkill = async (skill: SkillDiscoveryEntry) => {
    if (!skill.deletable) {
      return;
    }

    if (!window.confirm(`Delete ${skill.name} from the GoodNight library?`)) {
      return;
    }

    await runAction(() => deleteLibrarySkill(skill.id), 'Skill deleted from GoodNight.');
  };

  return (
    <section className="gn-agent-shell-page gn-agent-skills-page">
      <header className="gn-agent-shell-page-header gn-agent-shell-page-header-stack">
        <div className="gn-agent-shell-page-header-copy">
          <span className="gn-agent-context-badge">GN Agent</span>
          <h3>Global Skills</h3>
          <p>Chat stays a normal chat window. Manage global skills here and call them from chat with `@skill`.</p>
        </div>
        <div className="gn-agent-skills-toolbar">
          <button type="button" className="gn-agent-skills-action-btn" onClick={() => void handleImportLocal()} disabled={isWorking}>
            Import Local Skill
          </button>
          <button type="button" className="gn-agent-skills-action-btn" onClick={() => void handleImportGitHub()} disabled={isWorking}>
            Download from GitHub
          </button>
          <button type="button" className="gn-agent-skills-action-btn secondary" onClick={() => void loadSkills()} disabled={isWorking || isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {statusMessage ? <div className="gn-agent-skills-banner success">{statusMessage}</div> : null}
      {errorMessage ? <div className="gn-agent-skills-banner error">{errorMessage}</div> : null}

      <div className="gn-agent-skills-grid">
        {isLoading ? (
          <article className="gn-agent-skills-card">
            <strong>Loading skills...</strong>
            <span>Scanning GoodNight, Codex, and Claude skill locations.</span>
          </article>
        ) : null}

        {!isLoading && skills.length === 0 ? (
          <article className="gn-agent-skills-card">
            <strong>No skills found</strong>
            <span>Import a local skill or download one from GitHub to get started.</span>
          </article>
        ) : null}

        {!isLoading
          ? skills.map((skill) => (
              <article key={`${skill.source}-${skill.id}-${skill.path}`} className="gn-agent-skills-card">
                <div className="gn-agent-skills-card-header">
                  <div>
                    <strong>{skill.name}</strong>
                    <span>{skill.id}</span>
                  </div>
                  <span className={`gn-agent-skills-source-badge${skill.builtin ? ' builtin' : ''}`}>{formatSourceBadge(skill)}</span>
                </div>

                <div className="gn-agent-skills-meta">
                  <code>{skill.path}</code>
                  <div className="gn-agent-skills-tags">
                    {skill.syncedToCodex ? <span>Codex synced</span> : <span>Sync to Codex</span>}
                    {skill.syncedToClaude ? <span>Claude synced</span> : <span>Sync to Claude</span>}
                  </div>
                </div>

                <div className="gn-agent-skills-actions">
                  <button
                    type="button"
                    className="gn-agent-skills-card-btn"
                    disabled={isWorking || !skill.imported}
                    onClick={() => void runAction(() => syncSkillToRuntime({ skillId: skill.id, runtime: 'codex' }), `${skill.name} synced to Codex.`)}
                  >
                    Sync to Codex
                  </button>
                  <button
                    type="button"
                    className="gn-agent-skills-card-btn"
                    disabled={isWorking || !skill.imported}
                    onClick={() => void runAction(() => syncSkillToRuntime({ skillId: skill.id, runtime: 'claude' }), `${skill.name} synced to Claude.`)}
                  >
                    Sync to Claude
                  </button>
                  {skill.deletable ? (
                    <button
                      type="button"
                      className="gn-agent-skills-card-btn danger"
                      disabled={isWorking}
                      onClick={() => void handleDeleteSkill(skill)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          : null}
      </div>
    </section>
  );
};

