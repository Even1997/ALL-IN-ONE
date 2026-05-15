import { create } from 'zustand';

export type UiLanguage = 'system' | 'zh-CN' | 'en-US';
export type StartupPage =
  | 'last-opened'
  | 'project-picker'
  | 'agent'
  | 'knowledge'
  | 'page'
  | 'design'
  | 'develop'
  | 'test'
  | 'operations';
export type UpdateChannel = 'stable' | 'preview';
export type NewWindowBehavior = 'project-picker' | 'recent-project' | 'blank-agent';

export type GeneralSettings = {
  uiLanguage: UiLanguage;
  startupPage: StartupPage;
  restoreLastSessionOnLaunch: boolean;
  openRecentWorkspaceOnLaunch: boolean;
  autoUpdateEnabled: boolean;
  updateChannel: UpdateChannel;
  newWindowBehavior: NewWindowBehavior;
};

type GeneralSettingsStore = GeneralSettings & {
  updateGeneralSettings: (patch: Partial<GeneralSettings>) => void;
  resetGeneralSettings: () => void;
};

type GeneralSettingsOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

const GENERAL_SETTINGS_STORAGE_KEY = 'goodnight-settings.general';

const UI_LANGUAGE_VALUES = new Set<UiLanguage>(['system', 'zh-CN', 'en-US']);
const STARTUP_PAGE_VALUES = new Set<StartupPage>([
  'last-opened',
  'project-picker',
  'agent',
  'knowledge',
  'page',
  'design',
  'develop',
  'test',
  'operations',
]);
const UPDATE_CHANNEL_VALUES = new Set<UpdateChannel>(['stable', 'preview']);
const NEW_WINDOW_BEHAVIOR_VALUES = new Set<NewWindowBehavior>(['project-picker', 'recent-project', 'blank-agent']);

export const GENERAL_SETTINGS_DEFAULTS: GeneralSettings = {
  uiLanguage: 'system',
  startupPage: 'last-opened',
  restoreLastSessionOnLaunch: true,
  openRecentWorkspaceOnLaunch: true,
  autoUpdateEnabled: true,
  updateChannel: 'stable',
  newWindowBehavior: 'project-picker',
};

export const UI_LANGUAGE_OPTIONS: GeneralSettingsOption<UiLanguage>[] = [
  { value: 'system', label: '系统', description: '跟随当前系统语言。' },
  { value: 'zh-CN', label: '简体中文', description: '优先使用中文界面。' },
  { value: 'en-US', label: '英文', description: '优先使用英文界面。' },
];

export const STARTUP_PAGE_OPTIONS: GeneralSettingsOption<StartupPage>[] = [
  { value: 'last-opened', label: '上次工作区', description: '优先回到上次使用的工作上下文。' },
  { value: 'project-picker', label: '项目选择器', description: '启动后先进入项目列表。' },
  { value: 'agent', label: '助手工作台', description: '直接进入助手工作台。' },
  { value: 'knowledge', label: '知识库', description: '直接进入知识与笔记工作区。' },
  { value: 'page', label: '页面草图', description: '直接进入页面与草图工作区。' },
  { value: 'design', label: '设计', description: '直接进入设计工作台。' },
  { value: 'develop', label: '开发', description: '直接进入开发视图。' },
  { value: 'test', label: '测试', description: '直接进入测试视图。' },
  { value: 'operations', label: '运维', description: '直接进入运维与发布视图。' },
];

export const UPDATE_CHANNEL_OPTIONS: GeneralSettingsOption<UpdateChannel>[] = [
  { value: 'stable', label: '稳定版', description: '只接收稳定版本更新。' },
  { value: 'preview', label: '预览版', description: '优先体验预览功能与较新的构建。' },
];

export const NEW_WINDOW_BEHAVIOR_OPTIONS: GeneralSettingsOption<NewWindowBehavior>[] = [
  { value: 'project-picker', label: '项目选择器', description: '新窗口从项目列表开始。' },
  { value: 'recent-project', label: '最近项目', description: '新窗口优先打开最近项目。' },
  { value: 'blank-agent', label: '空白助手', description: '新窗口直接进入空白助手工作台。' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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

const normalizeGeneralSettings = (value: unknown): GeneralSettings => {
  if (!isRecord(value)) {
    return GENERAL_SETTINGS_DEFAULTS;
  }

  const legacyFollowSystemLanguage =
    typeof value.followSystemLanguage === 'boolean' ? value.followSystemLanguage : null;
  const storedUiLanguage = UI_LANGUAGE_VALUES.has(value.uiLanguage as UiLanguage)
    ? (value.uiLanguage as UiLanguage)
    : null;

  return {
    uiLanguage:
      legacyFollowSystemLanguage === true
        ? 'system'
        : (storedUiLanguage ?? GENERAL_SETTINGS_DEFAULTS.uiLanguage),
    startupPage: STARTUP_PAGE_VALUES.has(value.startupPage as StartupPage)
      ? (value.startupPage as StartupPage)
      : GENERAL_SETTINGS_DEFAULTS.startupPage,
    restoreLastSessionOnLaunch:
      typeof value.restoreLastSessionOnLaunch === 'boolean'
        ? value.restoreLastSessionOnLaunch
        : GENERAL_SETTINGS_DEFAULTS.restoreLastSessionOnLaunch,
    openRecentWorkspaceOnLaunch:
      typeof value.openRecentWorkspaceOnLaunch === 'boolean'
        ? value.openRecentWorkspaceOnLaunch
        : GENERAL_SETTINGS_DEFAULTS.openRecentWorkspaceOnLaunch,
    autoUpdateEnabled:
      typeof value.autoUpdateEnabled === 'boolean'
        ? value.autoUpdateEnabled
        : GENERAL_SETTINGS_DEFAULTS.autoUpdateEnabled,
    updateChannel: UPDATE_CHANNEL_VALUES.has(value.updateChannel as UpdateChannel)
      ? (value.updateChannel as UpdateChannel)
      : GENERAL_SETTINGS_DEFAULTS.updateChannel,
    newWindowBehavior: NEW_WINDOW_BEHAVIOR_VALUES.has(value.newWindowBehavior as NewWindowBehavior)
      ? (value.newWindowBehavior as NewWindowBehavior)
      : GENERAL_SETTINGS_DEFAULTS.newWindowBehavior,
  };
};

const readStoredGeneralSettings = (): GeneralSettings => {
  const storage = getSettingsStorage();
  if (!storage) {
    return GENERAL_SETTINGS_DEFAULTS;
  }

  try {
    const raw = storage.getItem(GENERAL_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return GENERAL_SETTINGS_DEFAULTS;
    }

    return normalizeGeneralSettings(JSON.parse(raw));
  } catch {
    return GENERAL_SETTINGS_DEFAULTS;
  }
};

const writeStoredGeneralSettings = (settings: GeneralSettings) => {
  const storage = getSettingsStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(GENERAL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failures and keep in-memory state available.
  }
};

const buildPersistedGeneralSettings = (state: GeneralSettingsStore): GeneralSettings => ({
  uiLanguage: state.uiLanguage,
  startupPage: state.startupPage,
  restoreLastSessionOnLaunch: state.restoreLastSessionOnLaunch,
  openRecentWorkspaceOnLaunch: state.openRecentWorkspaceOnLaunch,
  autoUpdateEnabled: state.autoUpdateEnabled,
  updateChannel: state.updateChannel,
  newWindowBehavior: state.newWindowBehavior,
});

export const resolveEffectiveUiLanguage = (settings: Pick<GeneralSettings, 'uiLanguage'>) => {
  if (settings.uiLanguage !== 'system') {
    return settings.uiLanguage;
  }

  if (typeof navigator === 'undefined') {
    return 'zh-CN';
  }

  const systemLanguage = navigator.language.toLowerCase();
  if (systemLanguage.startsWith('zh')) {
    return 'zh-CN';
  }

  return 'en-US';
};

export const useGeneralSettingsStore = create<GeneralSettingsStore>((set) => ({
  ...readStoredGeneralSettings(),
  updateGeneralSettings: (patch) => set((state) => {
    const nextSettings = normalizeGeneralSettings({
      ...buildPersistedGeneralSettings(state),
      ...patch,
    });
    writeStoredGeneralSettings(nextSettings);
    return nextSettings;
  }),
  resetGeneralSettings: () => set(() => {
    writeStoredGeneralSettings(GENERAL_SETTINGS_DEFAULTS);
    return GENERAL_SETTINGS_DEFAULTS;
  }),
}));
