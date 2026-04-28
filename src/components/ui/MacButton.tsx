import type { ButtonHTMLAttributes, ReactNode } from 'react';

type MacButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type MacButtonSize = 'sm' | 'md';

type MacButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: MacButtonVariant;
  size?: MacButtonSize;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const MacButton = ({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: MacButtonProps) => (
  <button
    type={type}
    className={joinClasses('mac-button', `mac-button-${variant}`, `mac-button-${size}`, className)}
    {...props}
  />
);

type MacIconButtonProps = Omit<MacButtonProps, 'children'> & {
  children: ReactNode;
};

export const MacIconButton = ({ className, ...props }: MacIconButtonProps) => (
  <MacButton
    size="sm"
    variant="ghost"
    className={joinClasses('mac-button-icon', className)}
    {...props}
  />
);
