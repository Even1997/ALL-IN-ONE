import { create } from 'zustand';
import { APP_STYLE_STORAGE_KEY, getInitialAppStyle, isAppStyle, type AppStyle } from '../../appTheme';
import { LAYOUT_PREFERENCE_KEYS, readLayoutSize, writeLayoutSize } from '../../utils/layoutPreferences';

export type ThemeMode = 'light' | 'dark';
export type DefaultSidebarState = 'expanded' | 'collapsed';
export type ReadingWidth = 'narrow' | 'standard' | 'wide';
export type UiDensity = 'compact' | 'standard';
export type FontSize = 'small' | 'medium' | 'large';
export type ReducedMotion = 'follow-system' | 'on' | 'off';
export type TimelineDensity = 'compact' | 'standard';

export type AppearanceSettings = {
  themeMode: ThemeMode;
  appStyle: AppStyle;
  desktopAiPaneWidth: number;
  desktopAiPaneCollapsedByDefault: boolean;
  defaultSidebarState: DefaultSidebarState;
  readingWidth: ReadingWidth;
  uiDensity: UiDensity;
  fontSize: FontSize;
  animationsEnabled: boolean;
  reducedMotion: ReducedMotion;
  timelineDensity: TimelineDensity;
  showThinkingByDefault: boolean;
  showToolCardsByDefault: boolean;
  showFinalAnswerExpandedByDefault: boolean;
};

type AppearanceSettingsStore = AppearanceSettings & {
  updateAppearanceSettings: (patch: Partial<AppearanceSettings>) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setDesktopAiPaneWidth: (width: number) => void;
  resetAppearanceSettings: () => void;
};

type AppearanceSettingsOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

const APPEARANCE_SETTINGS_STORAGE_KEY = 'goodnight-settings.appearance';
const LEGACY_THEME_STORAGE_KEY = 'goodnight-theme-mode';
const LEGACY_DESKTOP_AI_PANE_WIDTH = 450;

const THEME_MODE_VALUES = new Set<ThemeMode>(['light', 'dark']);
const DEFAULT_SIDEBAR_STATE_VALUES = new Set<DefaultSidebarState>(['expanded', 'collapsed']);
const READING_WIDTH_VALUES = new Set<ReadingWidth>(['narrow', 'standard', 'wide']);
const UI_DENSITY_VALUES = new Set<UiDensity>(['compact', 'standard']);
const FONT_SIZE_VALUES = new Set<FontSize>(['small', 'medium', 'large']);
const REDUCED_MOTION_VALUES = new Set<ReducedMotion>(['follow-system', 'on', 'off']);
const TIMELINE_DENSITY_VALUES = new Set<TimelineDensity>(['compact', 'standard']);

export const DESKTOP_AI_PANE_WIDTH_BOUNDS = { min: 280, max: 560 };
export const DEFAULT_DESKTOP_AI_PANE_WIDTH = 360;

export const APPEARANCE_SETTINGS_DEFAULTS: AppearanceSettings = {
  themeMode: 'light',
  appStyle: 'workbench',
  desktopAiPaneWidth: DEFAULT_DESKTOP_AI_PANE_WIDTH,
  desktopAiPaneCollapsedByDefault: false,
  defaultSidebarState: 'expanded',
  readingWidth: 'standard',
  uiDensity: 'standard',
  fontSize: 'medium',
  animationsEnabled: true,
  reducedMotion: 'follow-system',
  timelineDensity: 'standard',
  showThinkingByDefault: false,
  showToolCardsByDefault: true,
  showFinalAnswerExpandedByDefault: true,
};

export const THEME_MODE_OPTIONS: AppearanceSettingsOption<ThemeMode>[] = [
  { value: 'light', label: '浅色', description: '明亮、安静的桌面工作台。' },
  { value: 'dark', label: '深色', description: '保持层级清晰的深色工作台。' },
];

export const DEFAULT_SIDEBAR_STATE_OPTIONS: AppearanceSettingsOption<DefaultSidebarState>[] = [
  { value: 'expanded', label: '展开', description: '默认显示完整侧栏。' },
  { value: 'collapsed', label: '收起', description: '进入工作区时先收起侧栏。' },
];

export const READING_WIDTH_OPTIONS: AppearanceSettingsOption<ReadingWidth>[] = [
  { value: 'narrow', label: '窄', description: '更适合专注阅读。' },
  { value: 'standard', label: '标准', description: '默认阅读宽度。' },
  { value: 'wide', label: '宽', description: '适合更宽的文档区域。' },
];

export const UI_DENSITY_OPTIONS: AppearanceSettingsOption<UiDensity>[] = [
  { value: 'compact', label: '紧凑', description: '减少列表与表单留白。' },
  { value: 'standard', label: '标准', description: '保持标准桌面留白。' },
];

export const FONT_SIZE_OPTIONS: AppearanceSettingsOption<FontSize>[] = [
  { value: 'small', label: '小', description: '更高信息密度。' },
  { value: 'medium', label: '中', description: '默认字号。' },
  { value: 'large', label: '大', description: '更容易阅读。' },
];

export const REDUCED_MOTION_OPTIONS: AppearanceSettingsOption<ReducedMotion>[] = [
  { value: 'follow-system', label: '跟随系统', description: '遵循系统的减少动效偏好。' },
  { value: 'on', label: '减少动效', description: '尽量减少过渡动画。' },
  { value: 'off', label: '保留动效', description: '允许标准过渡动效。' },
];

export const TIMELINE_DENSITY_OPTIONS: AppearanceSettingsOption<TimelineDensity>[] = [
  { value: 'compact', label: '紧凑', description: '更紧凑地显示 AI 时间线。' },
  { value: 'standard', label: '标准', description: '保持默认阅读节奏。' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clampDesktopAiPaneWidthSetting = (value: number) =>
  Math.min(DESKTOP_AI_PANE_WIDTH_BOUNDS.max, Math.max(DESKTOP_AI_PANE_WIDTH_BOUNDS.min, value));

const getSettingsStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readLegacyThemeMode = (): ThemeMode => {
  const storage = getSettingsStorage();
  if (!storage) {
    return APPEARANCE_SETTINGS_DEFAULTS.themeMode;
  }

  return storage.getItem(LEGACY_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
};

const readLegacyAppStyle = (): AppStyle => {
  if (typeof window === 'undefined') {
    return APPEARANCE_SETTINGS_DEFAULTS.appStyle;
  }

  return getInitialAppStyle(() => window.localStorage.getItem(APP_STYLE_STORAGE_KEY));
};

const readLegacyDesktopAiPaneWidth = () => {
  const nextWidth = readLayoutSize(
    LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
    DEFAULT_DESKTOP_AI_PANE_WIDTH,
    DESKTOP_AI_PANE_WIDTH_BOUNDS,
  );

  if (nextWidth === LEGACY_DESKTOP_AI_PANE_WIDTH) {
    return writeLayoutSize(
      LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
      DEFAULT_DESKTOP_AI_PANE_WIDTH,
      DESKTOP_AI_PANE_WIDTH_BOUNDS,
    );
  }

  return nextWidth;
};

const normalizeAppearanceSettings = (value: unknown): AppearanceSettings => {
  const raw = isRecord(value) ? value : {};
  const desktopAiPaneWidth =
    typeof raw.desktopAiPaneWidth === 'number' && Number.isFinite(raw.desktopAiPaneWidth)
      ? clampDesktopAiPaneWidthSetting(raw.desktopAiPaneWidth)
      : readLegacyDesktopAiPaneWidth();
  const rawAppStyle = typeof raw.appStyle === 'string' ? raw.appStyle : null;
  const appStyle = isAppStyle(rawAppStyle)
    ? rawAppStyle
    : readLegacyAppStyle();

  return {
    themeMode: THEME_MODE_VALUES.has(raw.themeMode as ThemeMode)
      ? (raw.themeMode as ThemeMode)
      : readLegacyThemeMode(),
    appStyle,
    desktopAiPaneWidth,
    desktopAiPaneCollapsedByDefault:
      typeof raw.desktopAiPaneCollapsedByDefault === 'boolean'
        ? raw.desktopAiPaneCollapsedByDefault
        : APPEARANCE_SETTINGS_DEFAULTS.desktopAiPaneCollapsedByDefault,
    defaultSidebarState: DEFAULT_SIDEBAR_STATE_VALUES.has(raw.defaultSidebarState as DefaultSidebarState)
      ? (raw.defaultSidebarState as DefaultSidebarState)
      : APPEARANCE_SETTINGS_DEFAULTS.defaultSidebarState,
    readingWidth: READING_WIDTH_VALUES.has(raw.readingWidth as ReadingWidth)
      ? (raw.readingWidth as ReadingWidth)
      : APPEARANCE_SETTINGS_DEFAULTS.readingWidth,
    uiDensity: UI_DENSITY_VALUES.has(raw.uiDensity as UiDensity)
      ? (raw.uiDensity as UiDensity)
      : APPEARANCE_SETTINGS_DEFAULTS.uiDensity,
    fontSize: FONT_SIZE_VALUES.has(raw.fontSize as FontSize)
      ? (raw.fontSize as FontSize)
      : APPEARANCE_SETTINGS_DEFAULTS.fontSize,
    animationsEnabled:
      typeof raw.animationsEnabled === 'boolean'
        ? raw.animationsEnabled
        : APPEARANCE_SETTINGS_DEFAULTS.animationsEnabled,
    reducedMotion: REDUCED_MOTION_VALUES.has(raw.reducedMotion as ReducedMotion)
      ? (raw.reducedMotion as ReducedMotion)
      : APPEARANCE_SETTINGS_DEFAULTS.reducedMotion,
    timelineDensity: TIMELINE_DENSITY_VALUES.has(raw.timelineDensity as TimelineDensity)
      ? (raw.timelineDensity as TimelineDensity)
      : APPEARANCE_SETTINGS_DEFAULTS.timelineDensity,
    showThinkingByDefault:
      typeof raw.showThinkingByDefault === 'boolean'
        ? raw.showThinkingByDefault
        : APPEARANCE_SETTINGS_DEFAULTS.showThinkingByDefault,
    showToolCardsByDefault:
      typeof raw.showToolCardsByDefault === 'boolean'
        ? raw.showToolCardsByDefault
        : APPEARANCE_SETTINGS_DEFAULTS.showToolCardsByDefault,
    showFinalAnswerExpandedByDefault:
      typeof raw.showFinalAnswerExpandedByDefault === 'boolean'
        ? raw.showFinalAnswerExpandedByDefault
        : APPEARANCE_SETTINGS_DEFAULTS.showFinalAnswerExpandedByDefault,
  };
};

const readStoredAppearanceSettings = (): AppearanceSettings => {
  const storage = getSettingsStorage();
  if (!storage) {
    return normalizeAppearanceSettings(null);
  }

  try {
    const raw = storage.getItem(APPEARANCE_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return normalizeAppearanceSettings(null);
    }

    return normalizeAppearanceSettings(JSON.parse(raw));
  } catch {
    return normalizeAppearanceSettings(null);
  }
};

const writeStoredAppearanceSettings = (settings: AppearanceSettings) => {
  const storage = getSettingsStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(APPEARANCE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    storage.setItem(LEGACY_THEME_STORAGE_KEY, settings.themeMode);
    storage.setItem(APP_STYLE_STORAGE_KEY, settings.appStyle);
    writeLayoutSize(
      LAYOUT_PREFERENCE_KEYS.desktopAiPaneWidth,
      settings.desktopAiPaneWidth,
      DESKTOP_AI_PANE_WIDTH_BOUNDS,
      storage,
    );
  } catch {
    // Ignore storage write failures and keep in-memory state available.
  }
};

const buildPersistedAppearanceSettings = (state: AppearanceSettingsStore): AppearanceSettings => ({
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
});

export const useAppearanceSettingsStore = create<AppearanceSettingsStore>((set) => ({
  ...readStoredAppearanceSettings(),
  updateAppearanceSettings: (patch) => set((state) => {
    const nextSettings = normalizeAppearanceSettings({
      ...buildPersistedAppearanceSettings(state),
      ...patch,
    });
    writeStoredAppearanceSettings(nextSettings);
    return nextSettings;
  }),
  setThemeMode: (themeMode) => set((state) => {
    const nextSettings = normalizeAppearanceSettings({
      ...buildPersistedAppearanceSettings(state),
      themeMode,
    });
    writeStoredAppearanceSettings(nextSettings);
    return nextSettings;
  }),
  setDesktopAiPaneWidth: (desktopAiPaneWidth) => set((state) => {
    const nextSettings = normalizeAppearanceSettings({
      ...buildPersistedAppearanceSettings(state),
      desktopAiPaneWidth: clampDesktopAiPaneWidthSetting(desktopAiPaneWidth),
    });
    writeStoredAppearanceSettings(nextSettings);
    return nextSettings;
  }),
  resetAppearanceSettings: () => set(() => {
    const nextSettings = normalizeAppearanceSettings(APPEARANCE_SETTINGS_DEFAULTS);
    writeStoredAppearanceSettings(nextSettings);
    return nextSettings;
  }),
}));
