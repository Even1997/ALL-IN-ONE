// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

const getNodePlatformHint = () => {
  const runtimeProcess = (globalThis as { process?: { platform?: string } }).process;
  return typeof runtimeProcess?.platform === 'string' && runtimeProcess.platform.trim().length > 0
    ? runtimeProcess.platform
    : null;
};

export const isWindowsHost = () => {
  const browserNavigator =
    typeof navigator !== 'undefined' ? (navigator as NavigatorWithUserAgentData) : null;
  const platformHints = [
    browserNavigator?.userAgentData?.platform,
    browserNavigator?.platform,
    browserNavigator?.userAgent,
    getNodePlatformHint(),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return platformHints.some((value) => /win/i.test(value));
};

export const isCommandToolName = (toolName: string) =>
  toolName === 'bash' || toolName === 'powershell';
