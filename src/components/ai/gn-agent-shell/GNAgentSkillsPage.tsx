import React, { useEffect, useMemo, useState } from 'react';
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
type SkillSection = Exclude<SkillLibraryFilter, 'all'>;

const SKILL_LIBRARY_FILTERS: Array<{ value: SkillLibraryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'recommended', label: '推荐' },
  { value: 'system', label: '系统' },
  { value: 'personal', label: '个人' },
];

const SKILL_SECTION_META: Record<SkillSection, { label: string; description: string }> = {
  recommended: {
    label: '推荐',
    description: '适合先装上的能力入口',
  },
  system: {
    label: '系统',
    description: 'GoodNight 自带的基础能力',
  },
  personal: {
    label: '个人',
    description: '已经进入 .goodnight 的全局技能',
  },
};

const getSkillSection = (skill: SkillDiscoveryEntry): SkillSection => {
  if (skill.category === 'system') {
    return 'system';
  }

  if (skill.source === 'GoodNight recommended') {
    return 'recommended';
  }

  return 'personal';
};

const buildSkillKey = (skill: SkillDiscoveryEntry) => `${skill.source}:${skill.id}:${skill.path}`;

const getSkillPromptPath = (skill: SkillDiscoveryEntry) =>
  skill.manifestPath.replace(/skill\.json$/i, 'SKILL.md');

const isSkillInstalled = (skill: SkillDiscoveryEntry) =>
  skill.category === 'system' || skill.imported;

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
    return '已经纳入 GoodNight 全局技能库，可直接在聊天中用 /skill 调用。';
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

const renderSectionEmptyState = (title: string) => (
  <article className="gn-agent-skills-list-empty">
    <strong>{title}里还没有内容</strong>
    <span>换个筛选条件，或者先导入一些技能到 GoodNight 全局库。</span>
  </article>
);

const buildPromptPreview = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.length > 2200 ? `${trimmed.slice(0, 2200)}\n\n...` : trimmed;
};

const SummaryCard: React.FC<{
  label: string;
  value: string;
  hint: string;
}> = ({ label, value, hint }) => (
  <article className="gn-agent-skills-summary-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </article>
);

const SkillListItem: React.FC<{
  skill: SkillDiscoveryEntry;
  active: boolean;
  isWorking: boolean;
  onSelect: (skill: SkillDiscoveryEntry) => void;
  onImport: (skill: SkillDiscoveryEntry) => void;
}> = ({ skill, active, isWorking, onSelect, onImport }) => {
  const installed = isSkillInstalled(skill);

  return (
    <article className={`gn-agent-skills-list-item${active ? ' active' : ''}`}>
      <button
        type="button"
        className="gn-agent-skills-list-item-main"
        onClick={() => onSelect(skill)}
      >
        <div
          className={`gn-agent-skills-list-item-icon${skill.builtin ? ' system' : skill.imported ? ' personal' : ''}`}
          aria-hidden="true"
        >
          {skill.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="gn-agent-skills-list-item-copy">
          <div className="gn-agent-skills-list-item-title-row">
            <strong>{skill.name}</strong>
            <span className={`gn-agent-skills-source-badge${skill.builtin ? ' builtin' : ''}`}>
              {formatSourceBadge(skill)}
            </span>
          </div>
          <span>{buildSkillSummary(skill)}</span>
          <code>{skill.path}</code>
        </div>
      </button>
      {!installed ? (
        <button
          type="button"
          className="gn-agent-skills-list-item-quick-action"
          disabled={isWorking}
          onClick={() => void onImport(skill)}
        >
          导入
        </button>
      ) : (
        <span className="gn-agent-skills-list-item-status">已安装</span>
      )}
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
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null);
  const [selectedPromptContent, setSelectedPromptContent] = useState('');
  const [selectedPromptError, setSelectedPromptError] = useState<string | null>(null);
  const [isSelectedPromptLoading, setIsSelectedPromptLoading] = useState(false);
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

    await runAction(() => importLocalSkill(sourcePath), '本地技能已经导入到 GoodNight 全局库。');
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

    const gitRef =
      window.prompt('可选 git ref（branch、tag 或 commit）。留空默认 main。')?.trim() || undefined;
    await runAction(
      () => importGitHubSkill({ repo, path, gitRef }),
      'GitHub 技能已经导入到 GoodNight 全局库。'
    );
  };

  const handleDeleteSkill = async (skill: SkillDiscoveryEntry) => {
    if (!skill.deletable) {
      return;
    }

    if (!window.confirm(`确定要从 GoodNight 全局库移除 ${skill.name} 吗？`)) {
      return;
    }

    await runAction(() => deleteLibrarySkill(skill.id), '技能已经从 GoodNight 全局库移除。');
  };

  const handleQuickImport = async (skill: SkillDiscoveryEntry) => {
    if (isSkillInstalled(skill)) {
      return;
    }

    await runAction(() => importLocalSkill(skill.path), `${skill.name} 已经导入到 GoodNight 全局库。`);
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
    setStatusMessage(`已写入聊天框：/${skill.id}`);
    setErrorMessage(null);
  };

  const openPreview = async (skill: SkillDiscoveryEntry) => {
    setPreviewSkill(skill);
    setPreviewError(null);
    setPreviewContent('');
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
  const visibleSkills = useMemo(
    () =>
      skills.filter((skill) => {
        const matchesFilter = activeFilter === 'all' ? true : getSkillSection(skill) === activeFilter;
        return matchesFilter && matchesSkillQuery(skill, normalizedQuery);
      }),
    [activeFilter, normalizedQuery, skills]
  );

  useEffect(() => {
    if (visibleSkills.length === 0) {
      setSelectedSkillKey(null);
      return;
    }

    if (!selectedSkillKey || !visibleSkills.some((skill) => buildSkillKey(skill) === selectedSkillKey)) {
      setSelectedSkillKey(buildSkillKey(visibleSkills[0]));
    }
  }, [selectedSkillKey, visibleSkills]);

  const selectedSkill = useMemo(
    () => visibleSkills.find((skill) => buildSkillKey(skill) === selectedSkillKey) || null,
    [selectedSkillKey, visibleSkills]
  );

  useEffect(() => {
    let cancelled = false;

    if (!selectedSkill) {
      setSelectedPromptContent('');
      setSelectedPromptError(null);
      setIsSelectedPromptLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsSelectedPromptLoading(true);
    setSelectedPromptError(null);

    readSkillFile(getSkillPromptPath(selectedSkill))
      .then((content) => {
        if (!cancelled) {
          setSelectedPromptContent(content);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSelectedPromptContent('');
          setSelectedPromptError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSelectedPromptLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSkill]);

  const groupedSkills = useMemo(() => {
    return {
      recommended: visibleSkills.filter((skill) => getSkillSection(skill) === 'recommended'),
      system: visibleSkills.filter((skill) => getSkillSection(skill) === 'system'),
      personal: visibleSkills.filter((skill) => getSkillSection(skill) === 'personal'),
    };
  }, [visibleSkills]);

  const installedCount = skills.filter((skill) => isSkillInstalled(skill)).length;
  const importableCount = skills.filter((skill) => !isSkillInstalled(skill)).length;
  const visibleCount = visibleSkills.length;
  const promptPreview = buildPromptPreview(selectedPromptContent);

  return (
    <section className="gn-agent-shell-page gn-agent-skills-page">
      <header className="gn-agent-shell-page-header gn-agent-shell-page-header-stack gn-agent-skills-page-header">
        <div className="gn-agent-skills-topbar">
          <div className="gn-agent-skills-mode-pill">
            <span className="inactive">浏览</span>
            <span className="active">技能</span>
          </div>
          <div className="gn-agent-skills-toolbar">
            <button
              type="button"
              className="gn-agent-skills-action-btn secondary"
              onClick={() => void loadSkills()}
              disabled={isWorking || isLoading}
            >
              管理
            </button>
            <button
              type="button"
              className="gn-agent-skills-action-btn"
              onClick={() => void handleImportLocal()}
              disabled={isWorking}
            >
              导入本地技能
            </button>
            <button
              type="button"
              className="gn-agent-skills-action-btn"
              onClick={() => void handleImportGitHub()}
              disabled={isWorking}
            >
              GitHub 下载
            </button>
          </div>
        </div>

        <div className="gn-agent-skills-hero">
          <span className="gn-agent-context-badge">GN Agent</span>
          <h3>让 GoodNight 按你的方式工作</h3>
          <p>
            技能只属于 GoodNight，本体统一保存在用户级 `.goodnight`
            全局库里。在这里浏览、导入和管理，然后在聊天里通过 /skill 调用它们。
          </p>
        </div>

        <div className="gn-agent-skills-summary-grid">
          <SummaryCard label="全部技能" value={String(skills.length)} hint="当前全局库与可导入来源总数" />
          <SummaryCard label="已安装" value={String(installedCount)} hint="已经能直接在聊天里调用" />
          <SummaryCard label="待导入" value={String(importableCount)} hint="还可以继续补进 GoodNight" />
          <SummaryCard label="当前可见" value={String(visibleCount)} hint="受搜索和筛选影响" />
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
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as SkillLibraryFilter)}
              aria-label="技能筛选"
            >
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
        <div className="gn-agent-skills-shell">
          <article className="gn-agent-skills-list-empty">
            <strong>正在加载技能…</strong>
            <span>正在扫描 GoodNight 全局技能库和可导入来源。</span>
          </article>
        </div>
      ) : null}

      {!isLoading ? (
        <div className="gn-agent-skills-shell">
          <section className="gn-agent-skills-list-panel">
            {visibleSkills.length === 0 ? (
              <article className="gn-agent-skills-list-empty">
                <strong>还没有技能</strong>
                <span>导入本地技能或从 GitHub 下载后，这里会开始长出你的全局技能库。</span>
              </article>
            ) : (
              Object.entries(SKILL_SECTION_META).map(([section, meta]) => {
                const sectionSkills = groupedSkills[section as SkillSection];

                return (
                  <section key={section} className="gn-agent-skills-section">
                    <div className="gn-agent-skills-section-header">
                      <div>
                        <h4>{meta.label}</h4>
                        <span>{meta.description}</span>
                      </div>
                      <strong>{sectionSkills.length}</strong>
                    </div>

                    <div className="gn-agent-skills-list">
                      {sectionSkills.length > 0
                        ? sectionSkills.map((skill) => (
                            <SkillListItem
                              key={buildSkillKey(skill)}
                              skill={skill}
                              active={selectedSkillKey === buildSkillKey(skill)}
                              isWorking={isWorking}
                              onSelect={(nextSkill) => setSelectedSkillKey(buildSkillKey(nextSkill))}
                              onImport={handleQuickImport}
                            />
                          ))
                        : renderSectionEmptyState(meta.label)}
                    </div>
                  </section>
                );
              })
            )}
          </section>

          <aside className="gn-agent-skills-detail-panel">
            {selectedSkill ? (
              <>
                <div className="gn-agent-skills-detail-header">
                  <span className="gn-agent-skills-detail-eyebrow">当前选中</span>
                  <h4>技能详情</h4>
                  <div className="gn-agent-skills-detail-title-row">
                    <strong>{selectedSkill.name}</strong>
                    <span className={`gn-agent-skills-source-badge${selectedSkill.builtin ? ' builtin' : ''}`}>
                      {formatSourceBadge(selectedSkill)}
                    </span>
                  </div>
                  <p>{buildSkillSummary(selectedSkill)}</p>
                  <div className="gn-agent-skills-detail-meta">
                    <span>命令：/{selectedSkill.id}</span>
                    <span>来源：{selectedSkill.source}</span>
                    <span>{isSkillInstalled(selectedSkill) ? '状态：已安装' : '状态：可导入'}</span>
                  </div>
                </div>

                <div className="gn-agent-skills-detail-grid">
                  <SummaryCard
                    label="调用方式"
                    value={`/${selectedSkill.id}`}
                    hint="会被直接写入聊天输入框"
                  />
                  <SummaryCard
                    label="安装状态"
                    value={isSkillInstalled(selectedSkill) ? '已安装' : '可导入'}
                    hint="系统技能默认已启用"
                  />
                  <SummaryCard
                    label="库内位置"
                    value={selectedSkill.path}
                    hint="技能目录或来源路径"
                  />
                  <SummaryCard
                    label="提示词入口"
                    value={getSkillPromptPath(selectedSkill)}
                    hint="查看全文时读取的文件"
                  />
                </div>

                <div className="gn-agent-skills-detail-actions">
                  {isSkillInstalled(selectedSkill) ? (
                    <button
                      type="button"
                      className="gn-agent-skills-card-btn"
                      disabled={isWorking}
                      onClick={() => void handleUseSkill(selectedSkill)}
                    >
                      使用
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="gn-agent-skills-card-btn"
                      disabled={isWorking}
                      onClick={() => void handleQuickImport(selectedSkill)}
                    >
                      导入
                    </button>
                  )}
                  <button
                    type="button"
                    className="gn-agent-skills-card-btn"
                    disabled={isWorking}
                    onClick={() => void openPreview(selectedSkill)}
                  >
                    查看全文
                  </button>
                  {selectedSkill.deletable ? (
                    <button
                      type="button"
                      className="gn-agent-skills-card-btn danger"
                      disabled={isWorking}
                      onClick={() => void handleDeleteSkill(selectedSkill)}
                    >
                      移除
                    </button>
                  ) : null}
                </div>

                <section className="gn-agent-skills-detail-preview-card">
                  <div className="gn-agent-skills-detail-preview-header">
                    <div>
                      <span className="gn-agent-skills-detail-eyebrow">技能详情</span>
                      <h5>SKILL.md 预览</h5>
                    </div>
                    <code>{getSkillPromptPath(selectedSkill)}</code>
                  </div>

                  {isSelectedPromptLoading ? (
                    <div className="gn-agent-skills-preview-state">正在加载技能内容…</div>
                  ) : null}
                  {selectedPromptError ? (
                    <div className="gn-agent-skills-preview-state error">{selectedPromptError}</div>
                  ) : null}
                  {!isSelectedPromptLoading && !selectedPromptError ? (
                    promptPreview ? (
                      <pre className="gn-agent-skills-preview-body">{promptPreview}</pre>
                    ) : (
                      <div className="gn-agent-skills-preview-state">这个技能还没有可预览的 SKILL.md 内容。</div>
                    )
                  ) : null}
                </section>
              </>
            ) : (
              <article className="gn-agent-skills-list-empty">
                <strong>先选一个技能</strong>
                <span>左侧列表会把推荐、系统和个人技能都集中到这里。</span>
              </article>
            )}
          </aside>
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
