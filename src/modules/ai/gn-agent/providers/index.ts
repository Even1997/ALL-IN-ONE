// 文件作用：模块导出入口，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { claudeProviderRegistration } from './claudeRegistration';
import { codexProviderRegistration } from './codexRegistration';

let builtInProvidersRegistered = false;

export const GN_AGENT_PROVIDER_REGISTRY = {
  claude: claudeProviderRegistration,
  codex: codexProviderRegistration,
};

export function registerBuiltInProviders() {
  if (builtInProvidersRegistered) {
    return GN_AGENT_PROVIDER_REGISTRY;
  }

  builtInProvidersRegistered = true;
  return GN_AGENT_PROVIDER_REGISTRY;
}

registerBuiltInProviders();

