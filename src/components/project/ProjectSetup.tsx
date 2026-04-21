import React, { useMemo, useState } from 'react';
import { AppType } from '../../types';
import { CreateProjectInput } from '../../store/projectStore';

interface ProjectSetupProps {
  onCreateProject: (input: CreateProjectInput) => void;
}

const APP_TYPE_OPTIONS: Array<{ value: AppType; label: string; description: string }> = [
  { value: 'web', label: 'Web App', description: '适合后台系统、SaaS 产品和内容平台。' },
  { value: 'mobile', label: 'Mobile App', description: '适合 iOS / Android 客户端产品。' },
  { value: 'desktop', label: 'Desktop App', description: '适合本地开发工具和桌面工作台。' },
  { value: 'backend', label: 'Backend Service', description: '适合独立后端服务和内部平台。' },
  { value: 'api', label: 'API Service', description: '适合 API 优先的服务型项目。' },
  { value: 'mini_program', label: 'Mini Program', description: '适合小程序和轻量分发场景。' },
];

const FRONTEND_OPTIONS = ['React', 'Next.js', 'Vue', 'Nuxt', 'Flutter', 'React Native'];
const BACKEND_OPTIONS = ['Node.js', 'NestJS', 'Go', 'Tauri', 'Rust', 'None'];
const DATABASE_OPTIONS = ['PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'None'];
const UI_OPTIONS = ['Tailwind', 'Material UI', 'Ant Design', 'Chakra UI', 'Custom'];
const DEPLOY_OPTIONS = ['Vercel', 'Docker', 'AWS', 'Kubernetes', 'Local Server'];

const getDefaultValues = (appType: AppType) => {
  switch (appType) {
    case 'desktop':
      return {
        frontendFramework: 'React',
        backendFramework: 'Tauri',
        database: 'SQLite',
        uiFramework: 'Tailwind',
        deployment: 'Local Server',
      };
    case 'api':
      return {
        frontendFramework: 'React',
        backendFramework: 'NestJS',
        database: 'PostgreSQL',
        uiFramework: 'Tailwind',
        deployment: 'Docker',
      };
    case 'mobile':
      return {
        frontendFramework: 'React Native',
        backendFramework: 'Node.js',
        database: 'PostgreSQL',
        uiFramework: 'Custom',
        deployment: 'AWS',
      };
    default:
      return {
        frontendFramework: 'React',
        backendFramework: 'Node.js',
        database: 'PostgreSQL',
        uiFramework: 'Tailwind',
        deployment: 'Vercel',
      };
  }
};

export const ProjectSetup: React.FC<ProjectSetupProps> = ({ onCreateProject }) => {
  const [appType, setAppType] = useState<AppType>('desktop');
  const defaults = useMemo(() => getDefaultValues(appType), [appType]);
  const [form, setForm] = useState<CreateProjectInput>({
    name: '',
    appType: 'desktop',
    ...defaults,
  });

  const updateField = <K extends keyof CreateProjectInput>(field: K, value: CreateProjectInput[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAppTypeChange = (nextType: AppType) => {
    const nextDefaults = getDefaultValues(nextType);
    setAppType(nextType);
    setForm((prev) => ({
      ...prev,
      appType: nextType,
      ...nextDefaults,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      return;
    }

    onCreateProject({
      ...form,
      name: form.name.trim(),
    });
  };

  return (
    <div className="project-setup-shell">
      <div className="project-setup-hero">
        <div className="project-setup-badge">Phase 1</div>
        <h1>先把项目上下文建立起来</h1>
        <p>
          这一步会生成项目配置、初始 Project Graph 和 Project Memory，后续产品、设计、开发、测试和运维模块都会基于这份上下文工作。
        </p>
        <div className="project-setup-points">
          <span>项目配置持久化</span>
          <span>初始需求文档</span>
          <span>Feature Tree 起点</span>
        </div>
      </div>

      <form className="project-setup-card" onSubmit={handleSubmit}>
        <div className="project-setup-header">
          <div>
            <h2>创建项目</h2>
            <p>选择产品类型、技术栈和部署方式，进入真实工作区。</p>
          </div>
          <div className="project-setup-status">Project Manager</div>
        </div>

        <label className="setup-field">
          <span>项目名称</span>
          <input
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="例如：Visual DevFlow Studio"
            autoFocus
          />
        </label>

        <div className="setup-section">
          <div className="setup-section-title">产品类型</div>
          <div className="app-type-grid">
            {APP_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`app-type-card ${appType === option.value ? 'active' : ''}`}
                onClick={() => handleAppTypeChange(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-grid">
          <label className="setup-field">
            <span>前端框架</span>
            <select value={form.frontendFramework} onChange={(e) => updateField('frontendFramework', e.target.value)}>
              {FRONTEND_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="setup-field">
            <span>后端框架</span>
            <select value={form.backendFramework} onChange={(e) => updateField('backendFramework', e.target.value)}>
              {BACKEND_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="setup-field">
            <span>数据库</span>
            <select value={form.database} onChange={(e) => updateField('database', e.target.value)}>
              {DATABASE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="setup-field">
            <span>UI 框架</span>
            <select value={form.uiFramework} onChange={(e) => updateField('uiFramework', e.target.value)}>
              {UI_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="setup-field">
          <span>部署方式</span>
          <select value={form.deployment} onChange={(e) => updateField('deployment', e.target.value)}>
            {DEPLOY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="project-summary">
          <div>
            <span>当前配置</span>
            <strong>{form.appType} / {form.frontendFramework} / {form.backendFramework}</strong>
          </div>
          <div>
            <span>部署目标</span>
            <strong>{form.deployment}</strong>
          </div>
        </div>

        <div className="setup-actions">
          <button type="submit" className="primary-action" disabled={!form.name.trim()}>
            进入工作区
          </button>
        </div>
      </form>
    </div>
  );
};
