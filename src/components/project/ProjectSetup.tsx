import React, { useEffect, useState } from 'react';
import { MacButton, MacField, MacInput, MacPanel } from '../ui';
import type { ProjectConfig } from '../../types';
import type { CreateProjectInput } from '../../store/projectStore';
import type { ProjectStorageSettings } from '../../utils/projectPersistence';

interface ProjectSetupProps {
  projects: ProjectConfig[];
  activeProjectId?: string | null;
  currentProjectName?: string | null;
  projectStorageSettings?: ProjectStorageSettings | null;
  projectStorageDraftOverride?: string | null;
  projectStorageState?: 'idle' | 'loading' | 'saving' | 'saved' | 'error';
  projectStorageMessage?: string | null;
  projectVaultDraftOverride?: string | null;
  onCreateProject: (input: CreateProjectInput) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onSaveProjectStoragePath?: (path: string) => void | Promise<void>;
  onPickProjectStoragePath?: () => void | Promise<void>;
  onResetProjectStoragePath?: () => void | Promise<void>;
  onPickProjectVaultPath?: () => void | Promise<void>;
  onClose?: () => void;
}

export const ProjectSetup: React.FC<ProjectSetupProps> = ({
  projects,
  activeProjectId = null,
  currentProjectName = null,
  projectStorageSettings = null,
  projectStorageMessage = null,
  projectVaultDraftOverride = null,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onPickProjectVaultPath,
  onClose,
}) => {
  const defaultProjectStoragePath =
    projectStorageSettings?.rootPath || projectStorageSettings?.defaultPath || '';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [vaultPath, setVaultPath] = useState(defaultProjectStoragePath);

  useEffect(() => {
    if (projectVaultDraftOverride !== null) {
      setVaultPath(projectVaultDraftOverride);
      return;
    }

    setVaultPath((currentPath) => (currentPath.trim() ? currentPath : defaultProjectStoragePath));
  }, [defaultProjectStoragePath, projectVaultDraftOverride]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedVaultPath = vaultPath.trim();

    if (!trimmedName || !trimmedVaultPath) {
      return;
    }

    onCreateProject({
      name: trimmedName,
      description: trimmedDescription,
      vaultPath: trimmedVaultPath,
    });

    setName('');
    setDescription('');
    setVaultPath(defaultProjectStoragePath);
  };

  return (
    <div className="project-setup-shell project-manager-shell">
      <MacPanel
        as="aside"
        className="project-setup-card project-manager-panel project-manager-sidebar"
      >
        <div className="project-manager-sidebar-top">
          <div className="project-setup-header">
            <div>
              <h2>项目列表</h2>
              <p>
                {projects.length > 0
                  ? `当前共有 ${projects.length} 个项目。`
                  : '还没有项目，先新建一个。'}
              </p>
            </div>
            <div className="project-setup-status">Manager</div>
          </div>

          <div className="project-manager-sidebar-meta">
            <div className="project-manager-stat">
              <span>项目总数</span>
              <strong>{projects.length}</strong>
            </div>
            <div className="project-manager-stat">
              <span>当前项目</span>
              <strong>{currentProjectName || '未打开项目'}</strong>
            </div>
          </div>
        </div>

        <div className="project-manager-list">
          {projects.length > 0 ? (
            projects.map((project) => (
              <div
                key={project.id}
                className={`project-manager-item ${
                  activeProjectId === project.id ? 'active' : ''
                }`}
              >
                <button
                  className="project-manager-open"
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                >
                  <strong>{project.name}</strong>
                  <span>{project.description || '暂无项目简介'}</span>
                </button>
                <div className="project-manager-item-actions">
                  {activeProjectId === project.id ? (
                    <span className="project-manager-current-tag">当前</span>
                  ) : null}
                  <MacButton
                    className="project-manager-delete"
                    variant="danger"
                    size="sm"
                    onClick={() => onDeleteProject(project.id)}
                    aria-label={`删除项目 ${project.name}`}
                  >
                    删除
                  </MacButton>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">创建后就可以在这里切换多个项目。</div>
          )}
        </div>
      </MacPanel>

      <div className="project-manager-main">
        <div className="project-setup-hero project-manager-hero">
          <div className="project-setup-badge">Projects</div>
          <h1>多项目工作区</h1>
          <p>
            左侧固定项目列表，右侧专注于创建和设置，让切换项目和管理本地文件都更顺手。
          </p>
          <div className="project-setup-points project-manager-points">
            <span>左侧快速切换项目</span>
            <span>右侧直接新建项目</span>
            <span>知识库独立绑定本地文件夹</span>
          </div>
          {onClose ? (
            <div className="project-manager-hero-actions">
              <MacButton
                className="project-manager-back-btn"
                variant="secondary"
                onClick={onClose}
              >
                返回当前项目
              </MacButton>
            </div>
          ) : null}
        </div>

        <MacPanel
          as="form"
          className="project-setup-card project-manager-panel project-manager-form"
          onSubmit={handleSubmit}
        >
          <div className="project-setup-header">
            <div>
              <h2>新建项目</h2>
              <p>先绑定本地知识库文件夹，后续知识索引会直接走原生 m-flow 路径。</p>
            </div>
            <div className="project-setup-status">Create</div>
          </div>

          <MacField label="项目名称" className="setup-field">
            <MacInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：GoodNight Workspace"
              autoFocus
            />
          </MacField>

          <MacField label="项目简介" className="setup-field">
            <textarea
              className="mac-input mac-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="简单描述一下这个项目要做什么。"
              rows={6}
            />
          </MacField>

          <MacField label="本地知识库文件夹" className="setup-field">
            <div className="project-storage-inline">
              <MacInput
                value={vaultPath}
                onChange={(event) => setVaultPath(event.target.value)}
                placeholder="选择或填写一个本地文件夹，作为知识库 vault"
              />
              <MacButton
                type="button"
                variant="secondary"
                disabled={!onPickProjectVaultPath}
                onClick={() => void onPickProjectVaultPath?.()}
              >
                选择文件夹
              </MacButton>
            </div>
            {defaultProjectStoragePath ? (
              <p className="setup-helper-text">
                {projectStorageMessage || `默认目录：${defaultProjectStoragePath}`}
              </p>
            ) : null}
          </MacField>

          <div className="setup-actions">
            <MacButton
              type="submit"
              className="primary-action"
              variant="primary"
              disabled={!name.trim() || !vaultPath.trim()}
            >
              创建项目
            </MacButton>
          </div>
        </MacPanel>
      </div>
    </div>
  );
};
