import type { ElementType, HTMLAttributes, ReactNode } from 'react';

type MacPanelProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children: ReactNode;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const MacPanel = ({
  as: Component = 'section',
  className,
  children,
  ...props
}: MacPanelProps) => (
  <Component className={joinClasses('mac-panel', className)} {...props}>
    {children}
  </Component>
);
