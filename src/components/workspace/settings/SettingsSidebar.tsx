// 文件作用：侧边栏组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import type { SettingsTabId, SettingsTabMeta } from '../globalSettingsPageShared';

type SettingsSidebarProps = {
  tabs: SettingsTabMeta[];
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
};

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  tabs,
  activeTab,
  onSelectTab,
}) => (
  <aside className="chat-settings-workbench-sidebar" aria-label="设置分组">
    <div className="chat-settings-source-list">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`chat-settings-source-row${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onSelectTab(tab.id)}
        >
          <strong>{tab.label}</strong>
        </button>
      ))}
    </div>
  </aside>
);
