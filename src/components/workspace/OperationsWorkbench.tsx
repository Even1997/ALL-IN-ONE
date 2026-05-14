import type { GeneratedFile } from '../../types';
import { EmptyStateView, MacButton, NoteSurface, StateCard, WorkbenchIcon } from '../ui';

type OperationsWorkbenchProps = {
  projectName: string;
  memoryCount: number;
  deployTarget: string;
  deploySteps: string[];
  generatedFiles: GeneratedFile[];
  onGenerateDeployScript: () => void;
};

export const OperationsWorkbench = ({
  projectName,
  memoryCount,
  deployTarget,
  deploySteps,
  generatedFiles,
  onGenerateDeployScript,
}: OperationsWorkbenchProps) => (
  <div className="platform-review-workbench">
    <aside className="platform-review-sidebar">
      {[
        { id: 'deploy', label: '发布', icon: 'rocket' as const, active: true },
        { id: 'monitor', label: '监控', icon: 'monitor' as const, active: false },
        { id: 'config', label: '配置', icon: 'settings' as const, active: false },
      ].map((section) => (
        <button
          key={section.id}
          type="button"
          className={`platform-review-nav-item${section.active ? ' active' : ''}`}
        >
          <WorkbenchIcon name={section.icon} />
          <span>{section.label}</span>
        </button>
      ))}
    </aside>

    <div className="platform-review-stage">
      <div className="platform-review-summary">
        <StateCard title="当前项目" description={projectName} icon="product" tone="info" />
        <StateCard title="项目记忆" description={`${memoryCount} 项`} icon="knowledge" tone="warning" />
        <StateCard title="部署目标" description={deployTarget} icon="server" tone="success" />
      </div>

      <NoteSurface
        eyebrow="Operations"
        title="发布与运维工作台"
        subtitle="把部署步骤、交付物和状态信息压到更像 Finder / Notes 的一层。"
        actions={
          <MacButton type="button" variant="primary" onClick={onGenerateDeployScript}>
            生成部署脚本
          </MacButton>
        }
      >
        {deploySteps.length > 0 ? (
          <div className="platform-review-list">
            {deploySteps.map((step, index) => (
              <div key={`${step}:${index}`} className="platform-review-row">
                <span className="platform-review-step">{index + 1}</span>
                <div className="platform-review-copy">
                  <strong>{step}</strong>
                  <span>{deployTarget}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyStateView
            icon="rocket"
            title="还没有部署步骤"
            description="生成部署脚本后，这里会按标准卡片展示阶段、摘要和交付物。"
          />
        )}

        {generatedFiles.length > 0 ? (
          <div className="platform-review-deliverables">
            {generatedFiles.slice(0, 8).map((file) => (
              <div key={file.path} className="platform-review-deliverable">
                <WorkbenchIcon name="document" />
                <div>
                  <strong>{file.path.split('/').pop() || file.path}</strong>
                  <span>{file.summary}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </NoteSurface>
    </div>
  </div>
);
