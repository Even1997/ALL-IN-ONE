type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

export const isWindowsHost = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const browserNavigator = navigator as NavigatorWithUserAgentData;
  const platformHints = [
    browserNavigator.userAgentData?.platform,
    browserNavigator.platform,
    browserNavigator.userAgent,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return platformHints.some((value) => /win/i.test(value));
};

export const isCommandToolName = (toolName: string) =>
  toolName === 'bash' || toolName === 'powershell';

export const getBuiltInRuntimeToolNames = () =>
  [
    'glob',
    'grep',
    'ls',
    'view',
    'write',
    'edit',
    ...(isWindowsHost() ? ['powershell', 'bash'] : ['bash']),
    'fetch',
    'agent',
    'AskUserQuestion',
  ] as const;
