// 文件作用：卡片组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';

type SettingsReadonlyCardTone = 'default' | 'success' | 'warning' | 'danger' | 'planned';

type SettingsReadonlyCardProps = {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  tone?: SettingsReadonlyCardTone;
  mono?: boolean;
};

export const SettingsReadonlyCard: React.FC<SettingsReadonlyCardProps> = ({
  label,
  value,
  meta,
  tone = 'default',
  mono = false,
}) => (
  <article className={`chat-settings-readonly-card${tone === 'default' ? '' : ` is-${tone}`}`}>
    <span>{label}</span>
    {mono ? <code>{value}</code> : <strong>{value}</strong>}
    {meta ? (mono ? <code>{meta}</code> : <strong>{meta}</strong>) : null}
  </article>
);
