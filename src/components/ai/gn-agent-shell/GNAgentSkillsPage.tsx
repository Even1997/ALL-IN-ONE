import React, { useEffect, useState } from 'react';
import {
  deleteLibrarySkill,
  discoverLocalSkills,
  importGitHubSkill,
  importLocalSkill,
  readSkillFile,
  type SkillDiscoveryEntry,
} from '../../../modules/ai/skills/skillLibrary';
import { AI_CHAT_COMMAND_EVENT } from '../../../modules/ai/chat/chatCommands';
import { MacDialog } from '../../ui/MacDialog';
import './GNAgentSkillsPage.css';

type SkillLibraryFilter = 'all' | 'recommended' | 'system' | 'personal';

const SKILL_LIBRARY_FILTERS: Array<{ value: SkillLibraryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'recommended', label: '推荐' },
  { value: 'system', label: '系统' },
  { value: 'personal', label: '个人' },
];

const getSkillSection = (skill: SkillDiscoveryEntry): Exclude<SkillLibraryFilter, 'all'> => {
  if (skill.category === 'system') {
    return 'system';
  }

  if (skill.source === 'GoodNight recommended') {
    return 'recommended';
  }

  return 'personal';
};

const formatSourceBadge = (skill: SkillDiscoveryEntry) => {
  if (skill.category === 'system') {
    return '系统';
  }

  if (skill.source === 'GoodNight recommended') {
    return skill.imported ? '已安装推荐' : '官方推荐';
  }

  if (skill.imported) {
    return '已安装';
  }

  return '可导入';
};

const buildSkillSummary = (skill: SkillDiscoveryEntry) => {
  if (skill.category === 'system') {
    return 'GoodNight 自带的基础系统技能，默认可用。';
  }

  if (skill.source === 'GoodNight recommended') {
    return skill.imported
      ? '官方推荐技能，已经安装到 GoodNight 全局技能库；卸载后仍然可以重新安装。'
      : 'GoodNight 官方推荐技能，按需安装；如果以后不需要，也可以卸载后再装回来。';
  }

  if (skill.imported) {
    return '已经纳入 GoodNight 全局技能库，可直接在聊天中用 @skill 调用。';
  }

  return '来自外部来源，还没有进入 .goodnight，全局可见后可一键导入。';
};

const matchesSkillQuery = (skill: SkillDiscoveryEntry, query: string) => {
  if (!query) {
    return true;
  }

  const haystack = [skill.name, skill.id, skill.source, skill.path].join(' ').toLowerCase();
  return haystack.includes(query);
};

const getSkillPromptPath = (skill: SkillDiscoveryEntry) => skill.manifestPath.replace(/skill\.json$/i, 'SKILL.md');

const renderSectionEmptyState = (title: string) => (
  <article className="gn-agent-skills-card gn-agent-skills-card-empty">
    <div className="gn-agent-skills-card-copy">
      <strong>{title}里还没有内容</strong>
      <span>换个筛选条件，或者先导入一些技能到 GoodNight 全局库。</span>
    </div>
  </article>
);

const SkillCard: React.FC<{
  skill: SkillDiscoveryEntry;
  isWorking: boolean;
  onImport: (skill: SkillDiscoveryEntry) => void;
  onUse: (skill: SkillDiscoveryEntry) => void;
  onView: (skill: SkillDiscoveryEntry) => void;
  onDelete: (skill: SkillDiscoveryEntry) => void;
}> = ({ skill, isWorking, onImport, onUse, onView, onDelete }) => {
  const isInstalled = skill.category === 'system' || skill.imported;

  return (
    <article className="gn-agent-skills-card">
      <div className="gn-agent-skills-card-header">
        <div className={`gn-agent-skills-card-icon${skill.builtin ? ' system' : skill.imported ? ' personal' : ''}`} aria-hidden="true">
          {skill.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="gn-agent-skills-card-copy">
          <strong>{skill.name}</strong>
          <span>{buildSkillSummary(skill)}</span>
        </div>
        <button
          type="button"
          className={`gn-agent-skills-card-status${isInstalled ? ' installed' : ' available'}`}
          disabled={isInstalled || isWorking}
          onClick={() => void onImport(skill)}
          aria-label={isInstalled ? `${skill.name} 已安装` : `导入 ${skill.name}`}
        >
          {isInstalled ? '✓' : '+'}
        </button>
      </div>

      <div className="gn-agent-skills-meta">
        <span className={`gn-agent-skills-source-badge${skill.builtin ? ' builtin' : ''}`}>{formatSourceBadge(skill)}</span>
        <code>{skill.path}</code>
      </div>

      <div className="gn-agent-skills-actions">
        {isInstalled ? (
          <button type="button" className="gn-agent-skills-card-btn" disabled={isWorking} onClick={() => void onUse(skill)}>
            使用
          </button>
        ) : null}
        <button type="button" className="gn-agent-skills-card-btn" disabled={isWorking} onClick={() => void onView(skill)}>
          查看
        </button>
        {skill.deletable ? (
          <button
            type="button"
            className="gn-agent-skills-card-btn danger"
            disabled={isWorking}
            onClick={() => void onDelete(skill)}
          >
            移除
          </button>
        ) : null}
      </div>
    </article>
  );
};

export const GNAgentSkillsPage: React.FC = () => {
  const [skills, setSkills] = useState<SkillDiscoveryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SkillLibraryFilter>('all');
  const [previewSkill, setPreviewSkill] = useState<SkillDiscoveryEntry | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

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
    const sourcePath = window.prompt('导入本地技能：输入技能文件或文件夹路径。')?.trim();
    if (!sourcePath) {
      return;
    }

    await runAction(() => importLocalSkill(sourcePath), 'Skill imported into the GoodNight library.');
  };

  const handleImportGitHub = async () => {
    const repo = window.prompt('GitHub 下载：输入 owner/repo。')?.trim();
    if (!repo) {
      return;
    }

    const path = window.prompt('GitHub 下载：输入仓库里的技能路径。')?.trim();
    if (!path) {
      return;
    }

    const gitRef = window.prompt('可选 git ref（branch、tag 或 commit）。留空默认 main。')?.trim() || undefined;
    await runAction(() => importGitHubSkill({ repo, path, gitRef }), 'GitHub skill imported into the GoodNight library.');
  };

  const handleDeleteSkill = async (skill: SkillDiscoveryEntry) => {
    if (!skill.deletable) {
      return;
    }

    if (!window.confirm(`Delete ${skill.name} from the GoodNight library?`)) {
      return;
    }

    await runAction(() => deleteLibrarySkill(skill.id), 'Skill deleted from the GoodNight library.');
  };

  const handleQuickImport = async (skill: SkillDiscoveryEntry) => {
    if (skill.imported || skill.category === 'system') {
      return;
    }

    await runAction(() => importLocalSkill(skill.path), `${skill.name} imported into the GoodNight library.`);
  };

  const handleViewSkill = async (skill: SkillDiscoveryEntry) => {
    setPreviewSkill(skill);
    setPreviewContent('');
    setPreviewError(null);
    setIsPreviewLoading(true);

    try {
      const content = await readSkillFile(getSkillPromptPath(skill));
      setPreviewContent(content);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleUseSkill = (skill: SkillDiscoveryEntry) => {
    window.dispatchEvent(
      new CustomEvent(AI_CHAT_COMMAND_EVENT, {
        detail: {
          prompt: `/${skill.id} `,
          autoSubmit: false,
        },
      })
    );
    setStatusMessage(`已将 /${skill.id} 填入聊天框。`);
    setErrorMessage(null);
  };

  const handlePreviewOpenChange = (open: boolean) => {
    if (open) {
      return;
    }

    setPreviewSkill(null);
    setPreviewContent('');
    setPreviewError(null);
    setIsPreviewLoading(false);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleSkills = skills.filter((skill) => {
    const matchesFilter = activeFilter === 'all' ? true : getSkillSection(skill) === activeFilter;
    return matchesFilter && matchesSkillQuery(skill, normalizedQuery);
  });
  const recommendedSkills = visibleSkills.filter((skill) => getSkillSection(skill) === 'recommended');
  const systemSkills = visibleSkills.filter((skill) => getSkillSection(skill) === 'system');
  const personalSkills = visibleSkills.filter((skill) => getSkillSection(skill) === 'personal');

  return (
    <section className="gn-agent-shell-page gn-agent-skills-page">
      <header className="gn-agent-shell-page-header gn-agent-shell-page-header-stack gn-agent-skills-page-header">
        <div className="gn-agent-skills-topbar">
          <div className="gn-agent-skills-mode-pill">
            <span className="inactive">浏览</span>
            <span className="active">技能</span>
          </div>
          <div className="gn-agent-skills-toolbar">
            <button type="button" className="gn-agent-skills-action-btn secondary" onClick={() => void loadSkills()} disabled={isWorking || isLoading}>
              管理
            </button>
            <button type="button" className="gn-agent-skills-action-btn" onClick={() => void handleImportLocal()} disabled={isWorking}>
              导入本地技能
            </button>
            <button type="button" className="gn-agent-skills-action-btn" onClick={() => void handleImportGitHub()} disabled={isWorking}>
              GitHub 下载
            </button>
          </div>
        </div>

        <div className="gn-agent-skills-hero">
          <span className="gn-agent-context-badge">GN Agent</span>
          <h3>让 GoodNight 按你的方式工作</h3>
          <p>技能只属于 GoodNight，本体统一保存在用户级 `.goodnight` 全局库里。在这里浏览、导入和管理，然后在聊天里通过 `@skill` 调用它们。</p>
        </div>

        <div className="gn-agent-skills-search-row">
          <label className="gn-agent-skills-search">
            <span className="gn-agent-skills-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索技能"
              aria-label="搜索技能"
            />
          </label>

          <label className="gn-agent-skills-filter">
            <span className="sr-only">筛选技能分组</span>
            <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as SkillLibraryFilter)} aria-label="技能筛选">
              {SKILL_LIBRARY_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {statusMessage ? <div className="gn-agent-skills-banner success">{statusMessage}</div> : null}
      {errorMessage ? <div className="gn-agent-skills-banner error">{errorMessage}</div> : null}

      {isLoading ? (
        <div className="gn-agent-skills-grid">
          <article className="gn-agent-skills-card gn-agent-skills-card-empty">
            <strong>正在加载技能…</strong>
            <span>正在扫描 GoodNight 全局技能库和可导入来源。</span>
          </article>
        </div>
      ) : null}

      {!isLoading && visibleSkills.length === 0 ? (
        <div className="gn-agent-skills-grid">
          <article className="gn-agent-skills-card gn-agent-skills-card-empty">
            <strong>还没有技能</strong>
            <span>导入本地技能或从 GitHub 下载后，这里会开始长出你的全局技能库。</span>
          </article>
        </div>
      ) : null}

      {!isLoading && visibleSkills.length > 0 ? (
        <div className="gn-agent-skills-library">
          <section className="gn-agent-skills-section">
            <div className="gn-agent-skills-section-header">
              <h4>推荐</h4>
              <span>适合先装上的能力入口</span>
            </div>
            <div className="gn-agent-skills-grid">
              {recommendedSkills.length > 0
                ? recommendedSkills.map((skill) => (
                    <SkillCard
                      key={`${skill.source}-${skill.id}-${skill.path}`}
                      skill={skill}
                      isWorking={isWorking}
                      onImport={handleQuickImport}
                      onUse={handleUseSkill}
                      onView={handleViewSkill}
                      onDelete={handleDeleteSkill}
                    />
                  ))
                : renderSectionEmptyState('推荐')}
            </div>
          </section>

          <section className="gn-agent-skills-section">
            <div className="gn-agent-skills-section-header">
              <h4>系统</h4>
              <span>GoodNight 自带的基础能力</span>
            </div>
            <div className="gn-agent-skills-grid">
              {systemSkills.length > 0
                ? systemSkills.map((skill) => (
                    <SkillCard
                      key={`${skill.source}-${skill.id}-${skill.path}`}
                      skill={skill}
                      isWorking={isWorking}
                      onImport={handleQuickImport}
                      onUse={handleUseSkill}
                      onView={handleViewSkill}
                      onDelete={handleDeleteSkill}
                    />
                  ))
                : renderSectionEmptyState('系统')}
            </div>
          </section>

          <section className="gn-agent-skills-section">
            <div className="gn-agent-skills-section-header">
              <h4>个人</h4>
              <span>已经进入 .goodnight 的全局技能</span>
            </div>
            <div className="gn-agent-skills-grid">
              {personalSkills.length > 0
                ? personalSkills.map((skill) => (
                    <SkillCard
                      key={`${skill.source}-${skill.id}-${skill.path}`}
                      skill={skill}
                      isWorking={isWorking}
                      onImport={handleQuickImport}
                      onUse={handleUseSkill}
                      onView={handleViewSkill}
                      onDelete={handleDeleteSkill}
                    />
                  ))
                : renderSectionEmptyState('个人')}
            </div>
          </section>
        </div>
      ) : null}

      <MacDialog
        open={Boolean(previewSkill)}
        onOpenChange={handlePreviewOpenChange}
        title={previewSkill ? `${previewSkill.name} · 技能内容` : '技能内容'}
        description={previewSkill ? getSkillPromptPath(previewSkill) : undefined}
        contentClassName="gn-agent-skills-preview-dialog"
      >
        <div className="gn-agent-skills-preview">
          {isPreviewLoading ? <div className="gn-agent-skills-preview-state">正在加载技能内容…</div> : null}
          {previewError ? <div className="gn-agent-skills-preview-state error">{previewError}</div> : null}
          {!isPreviewLoading && !previewError && previewContent ? (
            <pre className="gn-agent-skills-preview-body">{previewContent}</pre>
          ) : null}
        </div>
      </MacDialog>
    </section>
  );
};
