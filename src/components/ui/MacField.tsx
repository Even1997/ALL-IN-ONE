// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ChangeEventHandler, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type MacFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

type MacSelectFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  selectClassName?: string;
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'onChange' | 'value'>;

type MacInputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

type MacTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  className?: string;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const MacField = ({ label, hint, className, children }: MacFieldProps) => (
  <label className={joinClasses('mac-field', className)}>
    <span className="mac-field-label">{label}</span>
    <span className="mac-field-control">{children}</span>
    {hint ? <span className="mac-field-hint">{hint}</span> : null}
  </label>
);

export const MacInput = ({ className, ...props }: MacInputProps) => (
  <input className={joinClasses('mac-input', className)} {...props} />
);

export const MacTextarea = ({ className, ...props }: MacTextareaProps) => (
  <textarea className={joinClasses('mac-input', 'mac-textarea', className)} {...props} />
);

export const MacSelectField = ({
  label,
  hint,
  className,
  selectClassName,
  value,
  onChange,
  children,
  ...props
}: MacSelectFieldProps) => (
  <MacField label={label} hint={hint} className={className}>
    <span className="mac-select-shell">
      <select
        className={joinClasses('mac-select', selectClassName)}
        value={value}
        onChange={onChange}
        {...props}
      >
        {children}
      </select>
    </span>
  </MacField>
);
