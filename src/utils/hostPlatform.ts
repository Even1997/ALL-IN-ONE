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
