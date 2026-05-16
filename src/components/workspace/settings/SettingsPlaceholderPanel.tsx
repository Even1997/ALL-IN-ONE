// 文件作用：面板组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import type { SettingsTabMeta } from '../globalSettingsPageShared';
import { SettingsSection } from './SettingsSection';

type SettingsPlaceholderPanelProps = {
  meta: SettingsTabMeta;
  highlights: string[];
};

export const SettingsPlaceholderPanel: React.FC<SettingsPlaceholderPanelProps> = ({
  meta,
  highlights,
}) => (
  <div className="chat-settings-placeholder-page">
    <SettingsSection
      className="chat-settings-placeholder-note"
      eyebrow={meta.eyebrow}
      title={meta.title}
      description={`${meta.description} 这一模块会在后续阶段接入真实字段与状态。`}
      actions={<span>Phase 1 shell</span>}
    >
      <section className="chat-settings-section-block">
        <div className="chat-settings-section-header">
          <strong>已锁定的模块范围</strong>
          <span>后续接入字段会围绕这些分组展开</span>
        </div>
        <div className="chat-settings-placeholder-list">
          {highlights.map((item) => (
            <article key={item} className="chat-settings-placeholder-item">
              <strong>{item}</strong>
              <span>阶段 1 先提供独立入口，阶段 2 之后接入真实设置项与状态展示。</span>
            </article>
          ))}
        </div>
      </section>

      <section className="chat-settings-section-block">
        <div className="chat-settings-section-header">
          <strong>当前阶段说明</strong>
          <span>先稳定信息架构，再逐模块补全真实功能</span>
        </div>
        <p className="chat-settings-placeholder-caption">
          当前页面遵循 workbench UI 标准，保持单一主舞台，不引入额外 companion pane，也不把未实现模块折叠回 AI 页里。
        </p>
      </section>
    </SettingsSection>
  </div>
);
