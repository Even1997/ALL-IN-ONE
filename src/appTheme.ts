export type AppStyle = 'minimal' | 'cartoon';

export type AppStyleOption = {
  id: AppStyle;
  label: string;
};

export const APP_STYLE_STORAGE_KEY = 'devflow-app-style';

export const APP_STYLE_OPTIONS: AppStyleOption[] = [
  { id: 'minimal', label: '简约' },
  { id: 'cartoon', label: '卡通' },
];

export const isAppStyle = (value: string | null): value is AppStyle =>
  APP_STYLE_OPTIONS.some((option) => option.id === value);

export const getInitialAppStyle = (readStoredStyle: () => string | null): AppStyle => {
  const storedStyle = readStoredStyle();
  return isAppStyle(storedStyle) ? storedStyle : 'minimal';
};
