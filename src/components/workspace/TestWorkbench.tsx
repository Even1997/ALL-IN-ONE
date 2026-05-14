import type { TestPlanCase } from '../../types';
import { EmptyStateView, MacButton, NoteSurface, StateCard, WorkbenchIcon } from '../ui';

type TestWorkbenchProps = {
  requirementCount: number;
  featureCount: number;
  caseCount: number;
  testCases: TestPlanCase[];
  onGeneratePlan: () => void;
};

const sections = [
  { id: 'plan', label: '测试计划', icon: 'note' as const, active: true },
  { id: 'bugs', label: '缺陷跟踪', icon: 'bug' as const, active: false },
  { id: 'report', label: '测试报告', icon: 'checkCircle' as const, active: false },
];

export const TestWorkbench = ({
  requirementCount,
  featureCount,
  caseCount,
  testCases,
  onGeneratePlan,
}: TestWorkbenchProps) => (
  <div className="platform-review-workbench">
    <aside className="platform-review-sidebar">
      {sections.map((section) => (
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
        <StateCard title="知识笔记" description={`${requirementCount} 条`} icon="knowledge" tone="info" />
        <StateCard title="功能节点" description={`${featureCount} 个`} icon="spark" tone="warning" />
        <StateCard title="测试用例" description={`${caseCount} 条`} icon="checkCircle" tone="success" />
      </div>

      <NoteSurface
        eyebrow="QA Workspace"
        title="测试工作台"
        subtitle="把计划、用例和结果统一收敛到同一套桌面级文档面里。"
        actions={
          <MacButton type="button" variant="primary" onClick={onGeneratePlan}>
            生成测试计划
          </MacButton>
        }
      >
        <div className="platform-review-list">
          {testCases.length > 0 ? (
            testCases.map((testCase) => (
              <div key={testCase.id} className="platform-review-row">
                <span className={`platform-review-dot is-${testCase.priority === 'high' ? 'warning' : 'success'}`} />
                <div className="platform-review-copy">
                  <strong>{testCase.title}</strong>
                  <span>
                    {testCase.module} / {testCase.type}
                  </span>
                </div>
                <span className="platform-review-badge">{testCase.status}</span>
              </div>
            ))
          ) : (
            <EmptyStateView
              icon="checkCircle"
              title="还没有测试用例"
              description="生成测试计划后，这里会按照统一卡片规范展示用例、状态和摘要。"
            />
          )}
        </div>
      </NoteSurface>
    </div>
  </div>
);
