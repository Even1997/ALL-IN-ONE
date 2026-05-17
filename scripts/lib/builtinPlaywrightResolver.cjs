const fs = require('fs');
const path = require('path');

const DEFAULT_PLAYWRIGHT_NODE_MODULE_CANDIDATES = [
  'C:\\Users\\Even\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules',
  'C:\\Users\\Even\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\playwright@1.59.1\\node_modules',
  'C:\\Users\\Even\\.gstack\\repos\\gstack\\node_modules',
];

const hasPlaywrightAtRoot = (rootPath, exists) => exists(path.join(rootPath, 'playwright'));

const hasPlaywrightCoreAtRoot = (rootPath, exists) => exists(path.join(rootPath, 'playwright-core'));

const pickPreferredNodeModulesRoot = (candidates, input = {}) => {
  const exists = input.exists || fs.existsSync;
  const normalized = [...new Set((candidates || []).filter(Boolean))];
  const playable = normalized.filter((rootPath) => hasPlaywrightAtRoot(rootPath, exists));
  const complete = playable.filter((rootPath) => hasPlaywrightCoreAtRoot(rootPath, exists));

  if (complete.length > 0) {
    return complete[0];
  }

  if (playable.length > 0) {
    return playable[0];
  }

  return null;
};

const buildDefaultNodeModulesCandidates = (scriptDir) => {
  const workspaceNodeModules = scriptDir ? path.resolve(scriptDir, '..', 'node_modules') : null;
  return [
    process.env.GN_NODE_PATH || null,
    process.env.NODE_PATH || null,
    ...DEFAULT_PLAYWRIGHT_NODE_MODULE_CANDIDATES,
    workspaceNodeModules,
  ].filter(Boolean);
};

module.exports = {
  DEFAULT_PLAYWRIGHT_NODE_MODULE_CANDIDATES,
  pickPreferredNodeModulesRoot,
  buildDefaultNodeModulesCandidates,
};
