// 文件作用：面板组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  getAgentRuntimeSettings,
  updateAgentRuntimeSettings,
  type AgentRuntimeSettings,
} from '../../../modules/ai/runtime/agentRuntimeClient';
import { useApprovalStore } from '../../../modules/ai/runtime/approval/approvalStore';
import {
  permissionModeToSandboxPolicy,
  sandboxPolicyToPermissionMode,
} from '../../../modules/ai/runtime/approval/permissionMode';
import type { PermissionMode, SandboxPolicy } from '../../../modules/ai/runtime/approval/approvalTypes';
import {
  SettingsFieldRow,
  SettingsSelectControl,
  SettingsToggleControl,
} from './SettingsFieldRow';
import { SettingsReadonlyCard } from './SettingsReadonlyCard';
import { SettingsSection } from './SettingsSection';

const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode;
  label: string;
  description: string;
}> = [
  { value: 'ask', label: '默认权限', description: '读操作优先通过，写入与高风险动作先确认。' },
  { value: 'plan', label: '规划优先', description: '更偏向先分析和规划，再决定是否执行。' },
  { value: 'auto', label: '自动执行', description: '常见动作尽量少打断，适合高频工作流。' },
  { value: 'bypass', label: '完全放行', description: '最少拦截，适合明确知道风险的场景。' },
];

const SANDBOX_POLICY_OPTIONS: Array<{
  value: SandboxPolicy;
  label: string;
  description: string;
}> = [
  { value: 'ask', label: '询问后执行', description: '保持默认边界，按需请求确认。' },
  { value: 'deny', label: '默认拒绝', description: '高风险动作优先阻止，适合谨慎模式。' },
  { value: 'allow', label: '默认允许', description: '更偏向持续执行，减少中断。' },
  { value: 'bypass', label: '完全绕过', description: '跳过常规沙箱限制，仅建议高级场景使用。' },
];

const renderStatusNote = (status: 'loading' | 'idle' | 'saving' | 'error', message: string) => {
  if (!message) {
    return null;
  }

  return (
    <div className={`chat-settings-status-note ${status === 'error' ? 'is-error' : 'is-success'}`}>
      <strong>{status === 'error' ? '保存失败' : '设置已更新'}</strong>
      <span>{message}</span>
    </div>
  );
};

export const PermissionsSettingsPanel: React.FC = () => {
  const { setPermissionMode, setSandboxPolicy } = useApprovalStore(useShallow((state) => ({
    setPermissionMode: state.setPermissionMode,
    setSandboxPolicy: state.setSandboxPolicy,
  })));
  const [settings, setSettings] = useState<AgentRuntimeSettings | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const loadSettings = useCallback(async () => {
    setStatus('loading');
    setMessage('');

    try {
      const nextSettings = await getAgentRuntimeSettings();
      setSettings(nextSettings);
      setSandboxPolicy(nextSettings.sandboxPolicy);
      setPermissionMode(nextSettings.permissionMode || sandboxPolicyToPermissionMode(nextSettings.sandboxPolicy));
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '权限设置加载失败。');
    }
  }, [setPermissionMode, setSandboxPolicy]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const commitSettings = useCallback(
    async (patch: Partial<AgentRuntimeSettings>) => {
      setStatus('saving');
      setMessage('');

      try {
        const nextSettings = await updateAgentRuntimeSettings(patch);
        setSettings(nextSettings);
        setSandboxPolicy(nextSettings.sandboxPolicy);
        setPermissionMode(nextSettings.permissionMode || sandboxPolicyToPermissionMode(nextSettings.sandboxPolicy));
        setMessage('权限设置已保存。');
        setStatus('idle');
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : '权限设置保存失败。');
      }
    },
    [setPermissionMode, setSandboxPolicy],
  );

  const statusNote = useMemo(() => renderStatusNote(status, message), [message, status]);

  if (!settings) {
    return (
      <div className="chat-settings-panel-surface">
        <SettingsSection
          eyebrow="权限"
          title="权限设置"
          description={status === 'error' ? '未能读取运行时权限设置。' : '正在读取运行时权限边界与恢复策略。'}
          actions={<span>{status === 'error' ? '加载失败' : '加载中'}</span>}
        >
          <section className="chat-settings-section-block">
            <div className="chat-settings-section-header">
              <strong>{status === 'error' ? '加载失败' : '正在准备'}</strong>
              <span>{message || '完成加载后，这里会显示真实的权限与恢复设置。'}</span>
            </div>
            {status === 'error' ? (
              <div className="chat-settings-note-actions">
                <button className="chat-settings-inline-btn" type="button" onClick={() => void loadSettings()}>
                  重新加载
                </button>
              </div>
            ) : null}
          </section>
        </SettingsSection>
      </div>
    );
  }

  return (
    <div className="chat-settings-panel-surface">
      <SettingsSection
        title="权限与恢复"
        description="审批、沙箱和会话恢复。"
      >
        {statusNote}

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>审批</strong>
            <span>控制运行时更偏向询问、规划还是自动执行。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="默认权限模式"
              hint="决定运行时更偏向询问、规划优先、自动执行还是完全放行。"
            >
              <SettingsSelectControl
                value={settings.permissionMode}
                options={PERMISSION_MODE_OPTIONS}
                disabled={status === 'saving'}
                onChange={(next) => void commitSettings({
                  permissionMode: next,
                  sandboxPolicy: permissionModeToSandboxPolicy(next),
                })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="沙箱策略"
              hint="直接控制底层执行边界。"
            >
              <SettingsSelectControl
                value={settings.sandboxPolicy}
                options={SANDBOX_POLICY_OPTIONS}
                disabled={status === 'saving'}
                onChange={(next) => void commitSettings({
                  sandboxPolicy: next,
                  permissionMode: sandboxPolicyToPermissionMode(next),
                })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>恢复</strong>
            <span>控制运行时会话恢复，不等同于产品层的页面恢复。</span>
          </div>
          <div className="chat-settings-grid">
            <SettingsFieldRow
              label="启动时恢复 Runtime 会话"
              hint="重新打开应用时，尝试恢复未完成的运行时 Agent 会话。"
            >
              <SettingsToggleControl
                checked={settings.autoResumeOnLaunch}
                disabled={status === 'saving'}
                onChange={(next) => void commitSettings({ autoResumeOnLaunch: next })}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label="保留恢复草稿"
              hint="让中间态的 resume draft 保持落盘。"
            >
              <SettingsToggleControl
                checked={settings.persistResumeDrafts}
                disabled={status === 'saving'}
                onChange={(next) => void commitSettings({ persistResumeDrafts: next })}
              />
            </SettingsFieldRow>
          </div>
        </section>

        <section className="chat-settings-section-block">
          <div className="chat-settings-section-header">
            <strong>规划中的能力</strong>
            <span>这些能力已在规划文档中定义，当前阶段只展示说明。</span>
          </div>
          <div className="chat-settings-static-grid">
            <SettingsReadonlyCard label="自动放行范围" value="规划中" meta="低风险动作自动执行范围" tone="planned" />
            <SettingsReadonlyCard label="高风险二次确认" value="规划中" meta="删除、写文件、外部副作用的二次确认" tone="planned" />
            <SettingsReadonlyCard label="命令超时策略" value="规划中" meta="统一默认超时与超时后行为" tone="planned" />
            <SettingsReadonlyCard label="中断行为" value="规划中" meta="ask / graceful-stop / force-stop" tone="planned" />
          </div>
        </section>
      </SettingsSection>
    </div>
  );
};
