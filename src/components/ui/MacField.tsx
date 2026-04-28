import type { ChangeEventHandler, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

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
