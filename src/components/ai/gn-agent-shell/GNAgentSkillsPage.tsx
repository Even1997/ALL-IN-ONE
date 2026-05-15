import React, { useEffect, useMemo, useState } from 'react';
import {
  deleteLibrarySkill,
  discoverLocalSkills,
  importGitHubSkill,
  importLocalSkill,
  readSkillFile,
  uninstallLibrarySkill,
  type SkillDiscoveryEntry,
} from '../../../modules/ai/skills/skillLibrary';
import {
  buildSkillSummary,
  canDeleteSkill,
  canUninstallSkill,
  formatSourceBadge,
  getSkillPrimaryAction,
  getSkillTab,
  getSystemSkillBucket,
  isBuiltinSystemSkill,
} from '../../../modules/ai/skills/skillLibraryPresentation';
import { AI_CHAT_COMMAND_EVENT } from '../../../modules/ai/chat/chatCommands';
import { MacDialog } from '../../ui/MacDialog';
import './GNAgentSkillsPage.css';

type SkillLibraryTab = 'system' | 'personal';

const buildSkillKey = (skill: SkillDiscoveryEntry) => `${skill.id}:${skill.path}`;

const getSkillPromptPath = (skill: SkillDiscoveryEntry) =>
  skill.manifestPath.replace(/skill\.json$/i, 'SKILL.md');

const matchesSkillQuery = (skill: SkillDiscoveryEntry, query: string) => {
  if (!query) {
    return true;
  }

  const haystack = [skill.name, skill.id, skill.source, skill.path].join(' ').toLowerCase();
  return haystack.includes(query);
};

const buildPromptPreview = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.length > 900 ? `${trimmed.slice(0, 900)}\n\n...` : trimmed;
};

const getSkillStateLabel = (skill: SkillDiscoveryEntry) => {
  if (isBuiltinSystemSkill(skill)) {
    return '内置';
  }

  return skill.imported ? '已安装' : '未安装';
};

const renderEmptyState = (title: string, description: string) => (
  <article className="gn-agent-skills-empty-state">
    <strong>{title}</strong>
    <span>{description}</span>
  </article>
);

const SkillRow: React.FC<{
  skill: SkillDiscoveryEntry;
  isWorking: boolean;
  onOpenDetail: (skill: SkillDiscoveryEntry) => void;
  onInstall: (skill: SkillDiscoveryEntry) => Promise<void>;
  onUninstall: (skill: SkillDiscoveryEntry) => Promise<void>;
  onDelete: (skill: SkillDiscoveryEntry) => Promise<void>;
  onUse: (skill: SkillDiscoveryEntry) => void;
}> = ({ skill, isWorking, onOpenDetail, onInstall, onUninstall, onDelete, onUse }) => {
  const primaryAction = getSkillPrimaryAction(skill);

  return (
    <article className="gn-agent-skills-row">
      <button
        type="button"
        className="gn-agent-skills-row-main"
        onClick={() => onOpenDetail(skill)}
      >
        <div className="gn-agent-skills-row-icon" aria-hidden="true">
          {skill.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="gn-agent-skills-row-copy">
          <div className="gn-agent-skills-row-title">
            <strong>{skill.name}</strong>
            <span className={`gn-agent-skills-source-badge${skill.builtin ? ' builtin' : ''}`}>
              {formatSourceBadge(skill)}
            </span>
          </div>
          <span className="gn-agent-skills-row-summary">{buildSkillSummary(skill)}</span>
          <div className="gn-agent-skills-row-meta">
            <span>/{skill.id}</span>
            <span>{skill.source}</span>
            <span>{getSkillStateLabel(skill)}</span>
          </div>
        </div>
      </button>

      <div className="gn-agent-skills-row-actions">
        <button
          type="button"
          className="gn-agent-skills-row-btn secondary"
          onClick={() => onOpenDetail(skill)}
        >
          查看详情
        </button>
        {primaryAction === 'install' ? (
          <button
            type="button"
            className="gn-agent-skills-row-btn"
            disabled={isWorking}
            onClick={() => void onInstall(skill)}
          >
            安装
          </button>
        ) : (
          <button
            type="button"
            className="gn-agent-skills-row-btn"
            disabled={isWorking}
            onClick={() => onUse(skill)}
          >
            使用
          </button>
        )}
        {canUninstallSkill(skill) ? (
          <button
            type="button"
            className="gn-agent-skills-row-btn secondary"
            disabled={isWorking}
            onClick={() => void onUninstall(skill)}
          >
            卸载
          </button>
        ) : null}
        {canDeleteSkill(skill) ? (
          <button
            type="button"
            className="gn-agent-skills-row-btn danger"
            disabled={isWorking}
            onClick={() => void onDelete(skill)}
          >
            删除
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
  const [activeTab, setActiveTab] = useState<SkillLibraryTab>('system');
  const [detailSkill, setDetailSkill] = useState<SkillDiscoveryEntry | null>(null);
  const [detailContent, setDetailContent] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
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

  useEffect(() => {
    if (!detailSkill) {
      return;
    }

    const nextSkill = skills.find((skill) => buildSkillKey(skill) === buildSkillKey(detailSkill));
    if (nextSkill) {
      setDetailSkill(nextSkill);
      return;
    }

    const fallbackById = skills.find((skill) => skill.id === detailSkill.id);
    if (fallbackById) {
      setDetailSkill(fallbackById);
      return;
    }

    setDetailSkill(null);
    setDetailContent('');
    setDetailError(null);
    setIsDetailLoading(false);
  }, [detailSkill, skills]);

  const loadDetailContent = async (skill: SkillDiscoveryEntry) => {
    setDetailSkill(skill);
    setDetailContent('');
    setDetailError(null);
    setIsDetailLoading(true);

    try {
      const content = await readSkillFile(getSkillPromptPath(skill));
      setDetailContent(content);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDetailLoading(false);
    }
  };

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

  const handleInstallSkill = async (skill: SkillDiscoveryEntry) => {
    await runAction(() => importLocalSkill(skill.path), `${skill.name} 已安装到技能库。`);
  };

  const handleUninstallSkill = async (skill: SkillDiscoveryEntry) => {
    const successMessage =
      getSkillTab(skill) === 'system'
        ? `${skill.name} 已卸载，并返回系统推荐列表。`
        : `${skill.name} 已卸载，个人条目仍保留在列表中。`;

    await runAction(() => uninstallLibrarySkill(skill.id), successMessage);
  };

  const handleDeleteSkill = async (skill: SkillDiscoveryEntry) => {
    if (!canDeleteSkill(skill)) {
      return;
    }

    if (!window.confirm(`确定删除 ${skill.name} 吗？删除后会同时移除安装副本和保留条目。`)) {
      return;
    }

    await runAction(() => deleteLibrarySkill(skill.id), `${skill.name} 已从个人技能库删除。`);
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
      if (detailSkill && buildSkillKey(detailSkill) === buildSkillKey(skill) && detailContent) {
        setPreviewContent(detailContent);
        return;
      }

      const content = await readSkillFile(getSkillPromptPath(skill));
      setPreviewContent(content);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDetailDialogChange = (open: boolean) => {
    if (open) {
      return;
    }

    setDetailSkill(null);
    setDetailContent('');
    setDetailError(null);
    setIsDetailLoading(false);
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
    () => skills.filter((skill) => matchesSkillQuery(skill, normalizedQuery)),
    [normalizedQuery, skills]
  );

  const systemRecommendedSkills = useMemo(
    () =>
      visibleSkills.filter(
        (skill) => getSkillTab(skill) === 'system' && getSystemSkillBucket(skill) === 'recommended'
      ),
    [visibleSkills]
  );
  const systemInstalledSkills = useMemo(
    () =>
      visibleSkills.filter(
        (skill) => getSkillTab(skill) === 'system' && getSystemSkillBucket(skill) === 'installed'
      ),
    [visibleSkills]
  );
  const personalSkills = useMemo(
    () => visibleSkills.filter((skill) => getSkillTab(skill) === 'personal'),
    [visibleSkills]
  );

  const systemCount = systemRecommendedSkills.length + systemInstalledSkills.length;
  const personalCount = personalSkills.length;
  const installedCount = skills.filter((skill) => skill.imported || isBuiltinSystemSkill(skill)).length;
  const detailPreview = buildPromptPreview(detailContent);

  return (
    <section className="gn-agent-shell-page gn-agent-skills-page">
      <header className="gn-agent-shell-page-header gn-agent-shell-page-header-stack gn-agent-skills-page-header">
        <div className="gn-agent-skills-toolbar-bar">
          <div className="gn-agent-skills-toolbar-copy">
            <span className="gn-agent-context-badge">技能</span>
            <div>
              <strong>技能库</strong>
              <span>统一管理系统技能、个人技能和导入来源。</span>
            </div>
          </div>

          <div className="gn-agent-skills-toolbar-actions">
            <button
              type="button"
              className="gn-agent-skills-toolbar-btn secondary"
              onClick={() => void loadSkills()}
              disabled={isWorking || isLoading}
            >
              刷新列表
            </button>
            <button
              type="button"
              className="gn-agent-skills-toolbar-btn"
              onClick={() => void handleImportLocal()}
              disabled={isWorking}
            >
              导入本地技能
            </button>
            <button
              type="button"
              className="gn-agent-skills-toolbar-btn"
              onClick={() => void handleImportGitHub()}
              disabled={isWorking}
            >
              GitHub 下载
            </button>
          </div>
        </div>

        <div className="gn-agent-skills-toolbar-strip">
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

          <div className="gn-agent-skills-tab-list" role="tablist" aria-label="技能分组">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'system'}
              className={`gn-agent-skills-tab${activeTab === 'system' ? ' active' : ''}`}
              onClick={() => setActiveTab('system')}
            >
              系统
              <span>{systemCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'personal'}
              className={`gn-agent-skills-tab${activeTab === 'personal' ? ' active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              个人
              <span>{personalCount}</span>
            </button>
          </div>
        </div>
      </header>

      {statusMessage ? <div className="gn-agent-skills-banner success">{statusMessage}</div> : null}
      {errorMessage ? <div className="gn-agent-skills-banner error">{errorMessage}</div> : null}

      <div className="gn-agent-skills-overview-bar">
        <span>{skills.length} 个技能条目</span>
        <span>{installedCount} 个已装</span>
        <span>{visibleSkills.length} 个当前可见</span>
      </div>

      {isLoading ? (
        <div className="gn-agent-skills-section-block">
          {renderEmptyState('正在加载技能库', '正在扫描本地技能、系统推荐和个人技能来源。')}
        </div>
      ) : null}

      {!isLoading ? (
        <div className="gn-agent-skills-stack">
          {activeTab === 'system' ? (
            <>
              <section className="gn-agent-skills-section-block">
                <div className="gn-agent-skills-section-head">
                  <div>
                    <strong>推荐</strong>
                    <span>官方推荐，安装后会移动到已装。</span>
                  </div>
                  <span>{systemRecommendedSkills.length}</span>
                </div>
                <div className="gn-agent-skills-compact-list">
                  {systemRecommendedSkills.length > 0
                    ? systemRecommendedSkills.map((skill) => (
                        <SkillRow
                          key={buildSkillKey(skill)}
                          skill={skill}
                          isWorking={isWorking}
                          onOpenDetail={(nextSkill) => void loadDetailContent(nextSkill)}
                          onInstall={handleInstallSkill}
                          onUninstall={handleUninstallSkill}
                          onDelete={handleDeleteSkill}
                          onUse={handleUseSkill}
                        />
                      ))
                    : renderEmptyState('没有待安装的推荐技能', '当前推荐技能已经安装完毕，或者被搜索条件过滤掉了。')}
                </div>
              </section>

              <section className="gn-agent-skills-section-block">
                <div className="gn-agent-skills-section-head">
                  <div>
                    <strong>已装</strong>
                    <span>包含系统内置技能，以及已经安装的推荐技能。</span>
                  </div>
                  <span>{systemInstalledSkills.length}</span>
                </div>
                <div className="gn-agent-skills-compact-list">
                  {systemInstalledSkills.length > 0
                    ? systemInstalledSkills.map((skill) => (
                        <SkillRow
                          key={buildSkillKey(skill)}
                          skill={skill}
                          isWorking={isWorking}
                          onOpenDetail={(nextSkill) => void loadDetailContent(nextSkill)}
                          onInstall={handleInstallSkill}
                          onUninstall={handleUninstallSkill}
                          onDelete={handleDeleteSkill}
                          onUse={handleUseSkill}
                        />
                      ))
                    : renderEmptyState('还没有系统已装技能', '这里会显示内置技能，以及已经安装的推荐技能。')}
                </div>
              </section>
            </>
          ) : (
            <section className="gn-agent-skills-section-block">
              <div className="gn-agent-skills-section-head">
                <div>
                  <strong>个人</strong>
                  <span>支持本地导入和 GitHub 导入；卸载不删除，删除才会真正移除。</span>
                </div>
                <span>{personalSkills.length}</span>
              </div>
              <div className="gn-agent-skills-compact-list">
                {personalSkills.length > 0
                  ? personalSkills.map((skill) => (
                      <SkillRow
                        key={buildSkillKey(skill)}
                        skill={skill}
                        isWorking={isWorking}
                        onOpenDetail={(nextSkill) => void loadDetailContent(nextSkill)}
                        onInstall={handleInstallSkill}
                        onUninstall={handleUninstallSkill}
                        onDelete={handleDeleteSkill}
                        onUse={handleUseSkill}
                      />
                    ))
                  : renderEmptyState('还没有个人技能', '可以从本地目录导入，或者直接从 GitHub 下载技能。')}
              </div>
            </section>
          )}
        </div>
      ) : null}

      <MacDialog
        open={Boolean(detailSkill)}
        onOpenChange={handleDetailDialogChange}
        title={detailSkill ? `${detailSkill.name} · 技能详情` : '技能详情'}
        description={detailSkill ? `${detailSkill.source} · /${detailSkill.id}` : undefined}
      >
        {detailSkill ? (
          <div className="gn-agent-skills-detail-dialog">
            <div className="gn-agent-skills-detail-hero">
              <div className="gn-agent-skills-detail-title">
                <strong>{detailSkill.name}</strong>
                <span className={`gn-agent-skills-source-badge${detailSkill.builtin ? ' builtin' : ''}`}>
                  {formatSourceBadge(detailSkill)}
                </span>
              </div>
              <p>{buildSkillSummary(detailSkill)}</p>
            </div>

            <div className="gn-agent-skills-detail-actions">
              {getSkillPrimaryAction(detailSkill) === 'install' ? (
                <button
                  type="button"
                  className="gn-agent-skills-toolbar-btn"
                  disabled={isWorking}
                  onClick={() => void handleInstallSkill(detailSkill)}
                >
                  安装
                </button>
              ) : (
                <button
                  type="button"
                  className="gn-agent-skills-toolbar-btn"
                  disabled={isWorking}
                  onClick={() => handleUseSkill(detailSkill)}
                >
                  使用
                </button>
              )}
              {canUninstallSkill(detailSkill) ? (
                <button
                  type="button"
                  className="gn-agent-skills-toolbar-btn secondary"
                  disabled={isWorking}
                  onClick={() => void handleUninstallSkill(detailSkill)}
                >
                  卸载
                </button>
              ) : null}
              {canDeleteSkill(detailSkill) ? (
                <button
                  type="button"
                  className="gn-agent-skills-toolbar-btn danger"
                  disabled={isWorking}
                  onClick={() => void handleDeleteSkill(detailSkill)}
                >
                  删除
                </button>
              ) : null}
              <button
                type="button"
                className="gn-agent-skills-toolbar-btn secondary"
                onClick={() => void openPreview(detailSkill)}
              >
                查看全文
              </button>
            </div>

            <div className="gn-agent-skills-detail-facts">
              <div>
                <span>调用方式</span>
                <code>/{detailSkill.id}</code>
              </div>
              <div>
                <span>当前状态</span>
                <strong>{getSkillStateLabel(detailSkill)}</strong>
              </div>
              <div>
                <span>来源</span>
                <strong>{detailSkill.source}</strong>
              </div>
              <div>
                <span>分类</span>
                <strong>{getSkillTab(detailSkill) === 'system' ? '系统' : '个人'}</strong>
              </div>
              <div>
                <span>技能路径</span>
                <code>{detailSkill.path}</code>
              </div>
              <div>
                <span>提示词入口</span>
                <code>{getSkillPromptPath(detailSkill)}</code>
              </div>
            </div>

            <section className="gn-agent-skills-detail-preview">
              <div className="gn-agent-skills-detail-preview-head">
                <strong>内容预览</strong>
                <span>详情弹窗里先展示简介，完整内容可继续点“查看全文”。</span>
              </div>
              {isDetailLoading ? (
                <div className="gn-agent-skills-preview-state">正在加载技能内容…</div>
              ) : null}
              {detailError ? (
                <div className="gn-agent-skills-preview-state error">{detailError}</div>
              ) : null}
              {!isDetailLoading && !detailError ? (
                detailPreview ? (
                  <pre className="gn-agent-skills-preview-body">{detailPreview}</pre>
                ) : (
                  <div className="gn-agent-skills-preview-state">这个技能暂时没有可预览的 SKILL.md 内容。</div>
                )
              ) : null}
            </section>
          </div>
        ) : null}
      </MacDialog>

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
