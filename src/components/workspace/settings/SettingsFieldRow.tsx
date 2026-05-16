// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';

export type SettingsOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type SettingsFieldRowProps = {
  label: string;
  hint?: string;
  fullWidth?: boolean;
  children: React.ReactNode;
};

type SettingsToggleControlProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  trueLabel?: string;
  falseLabel?: string;
};

type SettingsSelectControlProps<T extends string> = {
  value: T;
  options: Array<SettingsOption<T>>;
  onChange: (next: T) => void;
  disabled?: boolean;
};

type SettingsRangeControlProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  disabled?: boolean;
};

export const SettingsFieldRow: React.FC<SettingsFieldRowProps> = ({
  label,
  hint,
  fullWidth = false,
  children,
}) => (
  <label className={`chat-settings-field${fullWidth ? ' chat-settings-field-full' : ''}`}>
    <div className="chat-settings-field-copy">
      <span className="chat-settings-field-label">{label}</span>
      {hint ? <small>{hint}</small> : null}
    </div>
    <div className="chat-settings-field-control">{children}</div>
  </label>
);

export const SettingsToggleControl: React.FC<SettingsToggleControlProps> = ({
  checked,
  onChange,
  disabled = false,
  trueLabel = '开启',
  falseLabel = '关闭',
}) => (
  <div className="chat-settings-toggle" role="group" aria-label={`${trueLabel}/${falseLabel}`}>
    <button
      type="button"
      className={checked ? 'active' : ''}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(true)}
    >
      {trueLabel}
    </button>
    <button
      type="button"
      className={!checked ? 'active' : ''}
      aria-pressed={!checked}
      disabled={disabled}
      onClick={() => onChange(false)}
    >
      {falseLabel}
    </button>
  </div>
);

export const SettingsSelectControl = <T extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: SettingsSelectControlProps<T>) => (
  <select
    className="chat-settings-select"
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value as T)}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

export const SettingsRangeControl: React.FC<SettingsRangeControlProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
}) => (
  <div className="chat-settings-range-row">
    <input
      className="chat-settings-range-input"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </div>
);
