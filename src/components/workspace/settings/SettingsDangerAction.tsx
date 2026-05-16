// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React from 'react';

type SettingsDangerActionProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  note?: React.ReactNode;
};

export const SettingsDangerAction: React.FC<SettingsDangerActionProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  disabled = false,
  note,
}) => (
  <div className="chat-settings-danger-action">
    <div className="chat-settings-danger-copy">
      <strong>{title}</strong>
      <span>{description}</span>
      {note ? <small>{note}</small> : null}
    </div>
    <button
      className="chat-settings-inline-btn chat-settings-danger-button"
      type="button"
      disabled={disabled}
      onClick={onAction}
    >
      {actionLabel}
    </button>
  </div>
);
