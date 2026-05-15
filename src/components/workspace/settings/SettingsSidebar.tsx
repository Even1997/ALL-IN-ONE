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
