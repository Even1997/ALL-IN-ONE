// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

export type AppStyle = 'workbench';

export type AppStyleOption = {
  id: AppStyle;
  label: string;
};

export const APP_STYLE_STORAGE_KEY = 'goodnight-app-style';

export const APP_STYLE_OPTIONS: AppStyleOption[] = [
  { id: 'workbench', label: 'Workbench Standard' },
];

export const isAppStyle = (value: string | null): value is AppStyle => value === 'workbench';

export const getInitialAppStyle = (_readStoredStyle: () => string | null): AppStyle => 'workbench';
