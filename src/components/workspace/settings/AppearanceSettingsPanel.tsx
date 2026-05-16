// 文件作用：面板组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  DEFAULT_DESKTOP_AI_PANE_WIDTH,
  DEFAULT_SIDEBAR_STATE_OPTIONS,
  DESKTOP_AI_PANE_WIDTH_BOUNDS,
  FONT_SIZE_OPTIONS,
  READING_WIDTH_OPTIONS,
  REDUCED_MOTION_OPTIONS,
  THEME_MODE_OPTIONS,
  TIMELINE_DENSITY_OPTIONS,
  UI_DENSITY_OPTIONS,
  useAppearanceSettingsStore,
  type DefaultSidebarState,
  type FontSize,
  type ReadingWidth,
  type ReducedMotion,
  type ThemeMode,
  type TimelineDensity,
  type UiDensity,
} from '../../../modules/settings/appearanceSettingsStore';
import {
  SettingsFieldRow,
  SettingsRangeControl,
  SettingsSelectControl,
  SettingsToggleControl,
} from './SettingsFieldRow';
import { SettingsReadonlyCard } from './SettingsReadonlyCard';
import { SettingsSection } from './SettingsSection';

export const AppearanceSettingsPanel: React.FC = () => {
  const {
    themeMode,
    appStyle,
    desktopAiPaneWidth,
    desktopAiPaneCollapsedByDefault,
    defaultSidebarState,
    readingWidth,
    uiDensity,
    fontSize,
    animationsEnabled,
    reducedMotion,
    timelineDensity,
    showThinkingByDefault,
    showToolCardsByDefault,
    showFinalAnswerExpandedByDefault,
    updateAppearanceSettings,
    setThemeMode,
    setDesktopAiPaneWidth,
  } = useAppearanceSettingsStore(useShallow((state) => ({
    themeMode: state.themeMode,
    appStyle: state.appStyle,
    desktopAiPaneWidth: state.desktopAiPaneWidth,
    desktopAiPaneCollapsedByDefault: state.desktopAiPaneCollapsedByDefault,
    defaultSidebarState: state.defaultSidebarState,
    readingWidth: state.readingWidth,
    uiDensity: state.uiDensity,
    fontSize: state.fontSize,
    animationsEnabled: state.animationsEnabled,
    reducedMotion: state.reducedMotion,
    timelineDensity: state.timelineDensity,
    showThinkingByDefault: state.showThinkingByDefault,
    showToolCardsByDefault: state.showToolCardsByDefault,
    showFinalAnswerExpandedByDefault: state.showFinalAnswerExpandedByDefault,
    updateAppearanceSettings: state.updateAppearanceSettings,
    setThemeMode: state.setThemeMode,
    setDesktopAiPaneWidth: state.setDesktopAiPaneWidth,
  })));

  return (
    <div className="chat-settings-panel-surface">
      <SettingsSection
        title="显示与阅读"
        description="主题、布局和过程显示。"
      >
        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>主题</strong>
            <span>控制整体视觉风格。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="主题模式"
              hint="切换后立即生效。"
            >
              <SettingsSelectControl
                value={themeMode}
                options={THEME_MODE_OPTIONS}
                onChange={(next) => setThemeMode(next as ThemeMode)}
              />
            </SettingsFieldRow>
            <div className="chat-settings-static-grid">
              <SettingsReadonlyCard label="界面风格" value={appStyle} />
            </div>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>布局</strong>
            <span>控制侧栏、阅读区和助手面板的默认布局。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="助手面板宽度"
              hint="桌面端助手面板的默认宽度。"
              fullWidth
            >
              <SettingsRangeControl
                value={desktopAiPaneWidth}
                min={DESKTOP_AI_PANE_WIDTH_BOUNDS.min}
                max={DESKTOP_AI_PANE_WIDTH_BOUNDS.max}
                step={8}
                onChange={(next) => setDesktopAiPaneWidth(next || DEFAULT_DESKTOP_AI_PANE_WIDTH)}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="默认折叠助手面板"
              hint="作为新窗口和当前窗口的默认值。"
            >
              <SettingsToggleControl
                checked={desktopAiPaneCollapsedByDefault}
                onChange={(next) => updateAppearanceSettings({ desktopAiPaneCollapsedByDefault: next })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="默认侧栏状态"
              hint="进入工作区时侧栏的默认展示方式。"
            >
              <SettingsSelectControl
                value={defaultSidebarState}
                options={DEFAULT_SIDEBAR_STATE_OPTIONS}
                onChange={(next) => updateAppearanceSettings({ defaultSidebarState: next as DefaultSidebarState })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>阅读</strong>
            <span>控制阅读宽度、密度和字号。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="阅读宽度"
              hint="影响文档和设置内容的主阅读列宽。"
            >
              <SettingsSelectControl
                value={readingWidth}
                options={READING_WIDTH_OPTIONS}
                onChange={(next) => updateAppearanceSettings({ readingWidth: next as ReadingWidth })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="界面密度"
              hint="控制列表、表单和容器间距。"
            >
              <SettingsSelectControl
                value={uiDensity}
                options={UI_DENSITY_OPTIONS}
                onChange={(next) => updateAppearanceSettings({ uiDensity: next as UiDensity })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="默认字号"
              hint="控制全局界面文字的默认大小。"
            >
              <SettingsSelectControl
                value={fontSize}
                options={FONT_SIZE_OPTIONS}
                onChange={(next) => updateAppearanceSettings({ fontSize: next as FontSize })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>动效</strong>
            <span>只保留必要的状态变化动画。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="启用动画"
              hint="关闭后仍保留必要的状态反馈。"
            >
              <SettingsToggleControl
                checked={animationsEnabled}
                onChange={(next) => updateAppearanceSettings({ animationsEnabled: next })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="减少动效"
              hint="可跟随系统，也可单独覆盖。"
            >
              <SettingsSelectControl
                value={reducedMotion}
                options={REDUCED_MOTION_OPTIONS}
                onChange={(next) => updateAppearanceSettings({ reducedMotion: next as ReducedMotion })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>过程显示</strong>
            <span>只控制默认展示，不改变运行时语义。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="时间线密度"
              hint="控制过程信息的紧凑程度。"
            >
              <SettingsSelectControl
                value={timelineDensity}
                options={TIMELINE_DENSITY_OPTIONS}
                onChange={(next) => updateAppearanceSettings({ timelineDensity: next as TimelineDensity })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="默认展开思考过程"
              hint="只影响过程区的初始展开状态。"
            >
              <SettingsToggleControl
                checked={showThinkingByDefault}
                onChange={(next) => updateAppearanceSettings({ showThinkingByDefault: next })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="默认显示工具卡片"
              hint="保留工具执行过程的可见性。"
            >
              <SettingsToggleControl
                checked={showToolCardsByDefault}
                onChange={(next) => updateAppearanceSettings({ showToolCardsByDefault: next })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="默认展开最终回答"
              hint="最终回答保持主阅读面。"
            >
              <SettingsToggleControl
                checked={showFinalAnswerExpandedByDefault}
                onChange={(next) => updateAppearanceSettings({ showFinalAnswerExpandedByDefault: next })}
              />
            </SettingsFieldRow>
          </div>
        </section>
      </SettingsSection>
    </div>
  );
};
