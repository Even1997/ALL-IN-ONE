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
