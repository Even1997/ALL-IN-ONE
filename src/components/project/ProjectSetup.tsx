import React, { useEffect, useState } from 'react';
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
  onCreateProject: (input: CreateProjectInput) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onSaveProjectStoragePath?: (path: string) => void | Promise<void>;
  onPickProjectStoragePath?: () => void | Promise<void>;
  onResetProjectStoragePath?: () => void | Promise<void>;
  onClose?: () => void;
}

export const ProjectSetup: React.FC<ProjectSetupProps> = ({
  projects,
  activeProjectId = null,
  currentProjectName = null,
  projectStorageSettings = null,
  projectStorageDraftOverride = null,
  projectStorageState = 'idle',
  projectStorageMessage = null,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onSaveProjectStoragePath,
  onPickProjectStoragePath,
  onResetProjectStoragePath,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectStorageDraft, setProjectStorageDraft] = useState(projectStorageSettings?.rootPath || '');

  useEffect(() => {
    setProjectStorageDraft(projectStorageSettings?.rootPath || '');
  }, [projectStorageSettings?.rootPath]);

  useEffect(() => {
    if (projectStorageDraftOverride !== null) {
      setProjectStorageDraft(projectStorageDraftOverride);
    }
  }, [projectStorageDraftOverride]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      return;
    }

    onCreateProject({
      name: trimmedName,
      description: trimmedDescription,
    });

    setName('');
    setDescription('');
  };

  const isProjectStorageBusy = projectStorageState === 'loading' || projectStorageState === 'saving';
  const canSaveProjectStoragePath = Boolean(
    projectStorageSettings &&
      projectStorageDraft.trim() &&
      projectStorageDraft.trim() !== projectStorageSettings.rootPath &&
      !isProjectStorageBusy
  );

  return (
    <div className="project-setup-shell project-manager-shell">
      <aside className="project-setup-card project-manager-panel project-manager-sidebar">
        <div className="project-manager-sidebar-top">
          <div className="project-setup-header">
            <div>
              <h2>项目列表</h2>
              <p>{projects.length > 0 ? `当前共有 ${projects.length} 个项目。` : '还没有项目，先新建一个。'}</p>
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
                className={`project-manager-item ${activeProjectId === project.id ? 'active' : ''}`}
              >
                <button className="project-manager-open" type="button" onClick={() => onOpenProject(project.id)}>
                  <strong>{project.name}</strong>
                  <span>{project.description || '暂无项目简介'}</span>
                </button>
                <div className="project-manager-item-actions">
                  {activeProjectId === project.id ? <span className="project-manager-current-tag">当前</span> : null}
                  <button
                    className="project-manager-delete"
                    type="button"
                    onClick={() => onDeleteProject(project.id)}
                    aria-label={`删除项目 ${project.name}`}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">创建后就可以在这里切换多个项目。</div>
          )}
        </div>
      </aside>

      <div className="project-manager-main">
        <div className="project-setup-hero project-manager-hero">
          <div className="project-setup-badge">Projects</div>
          <h1>多项目工作区</h1>
          <p>左侧固定项目列表，右侧专注于创建和设置，让切换项目和管理本地文件都更顺手。</p>
          <div className="project-setup-points project-manager-points">
            <span>左侧快速切换项目</span>
            <span>右侧直接新建项目</span>
            <span>每个项目独立保存工作文件</span>
          </div>
          {onClose ? (
            <div className="project-manager-hero-actions">
              <button className="project-manager-back-btn" type="button" onClick={onClose}>
                返回当前项目
              </button>
            </div>
          ) : null}
        </div>

        <form className="project-setup-card project-manager-panel project-manager-form" onSubmit={handleSubmit}>
          <div className="project-setup-header">
            <div>
              <h2>新建项目</h2>
              <p>这里只需要项目名称和简介，其他设置先沿用默认值。</p>
            </div>
            <div className="project-setup-status">Create</div>
          </div>

          <label className="setup-field">
            <span>项目名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：GoodNight Workspace"
              autoFocus
            />
          </label>

          <label className="setup-field">
            <span>项目简介</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="简单描述一下这个项目要做什么。"
              rows={7}
            />
          </label>

          <div className="setup-actions">
            <button type="submit" className="primary-action" disabled={!name.trim()}>
              创建项目
            </button>
          </div>
        </form>

        {projectStorageSettings ? (
          <section className="project-setup-card project-manager-panel project-manager-form" aria-label="项目存储位置">
            <div className="project-setup-header">
              <div>
                <h2>项目存储位置</h2>
                <p>默认使用文档目录下的 `GoodNight/projects`，也可以改成你自己的绝对路径。</p>
              </div>
              <div className="project-setup-status">Storage</div>
            </div>

            <label className="setup-field">
              <span>项目根目录</span>
              <input
                value={projectStorageDraft}
                onChange={(event) => setProjectStorageDraft(event.target.value)}
                placeholder={projectStorageSettings.defaultPath}
                disabled={isProjectStorageBusy}
              />
            </label>

            <div className="project-manager-sidebar-meta">
              <div className="project-manager-stat">
                <span>当前生效路径</span>
                <strong>{projectStorageSettings.rootPath}</strong>
              </div>
              <div className="project-manager-stat">
                <span>默认路径</span>
                <strong>{projectStorageSettings.defaultPath}</strong>
              </div>
            </div>

            <div className="setup-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={isProjectStorageBusy || !onPickProjectStoragePath}
                onClick={() => void onPickProjectStoragePath?.()}
              >
                选择文件夹
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={!canSaveProjectStoragePath}
                onClick={() => void onSaveProjectStoragePath?.(projectStorageDraft)}
              >
                保存路径
              </button>
              <button
                type="button"
                className="secondary-action"
                disabled={isProjectStorageBusy || projectStorageSettings.isDefault}
                onClick={() => void onResetProjectStoragePath?.()}
              >
                恢复默认
              </button>
            </div>

            {projectStorageMessage ? <p className="setup-helper-text">{projectStorageMessage}</p> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
};
