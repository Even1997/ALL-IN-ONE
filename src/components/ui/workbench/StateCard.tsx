// 文件作用：卡片组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { ReactNode } from 'react';
import { WorkbenchIcon, type WorkbenchIconName } from '../WorkbenchIcon';

export type StateCardTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type StateCardState =
  | 'default'
  | 'hover'
  | 'selected'
  | 'collapsed'
  | 'empty'
  | 'loading'
  | 'error'
  | 'confirm'
  | 'syncing';

type StateCardProps = {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  icon?: WorkbenchIconName;
  tone?: StateCardTone;
  state?: StateCardState;
  className?: string;
};

const joinClasses = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export const StateCard = ({
  title,
  description,
  meta,
  children,
  footer,
  icon = 'spark',
  tone = 'neutral',
  state = 'default',
  className,
}: StateCardProps) => (
  <section
    className={joinClasses('wb-state-card', `is-${tone}`, state !== 'default' && `is-${state}`, className)}
    data-ui-state={state}
  >
    <div className="wb-state-card-header">
      <div className="wb-state-card-icon" aria-hidden="true">
        <WorkbenchIcon name={icon} />
      </div>
      <div className="wb-state-card-copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {meta ? <div className="wb-state-card-meta">{meta}</div> : null}
    </div>
    {children ? <div className="wb-state-card-body">{children}</div> : null}
    {footer ? <div className="wb-state-card-footer">{footer}</div> : null}
  </section>
);
