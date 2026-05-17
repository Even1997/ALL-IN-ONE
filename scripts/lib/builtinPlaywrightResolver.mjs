import resolver from './builtinPlaywrightResolver.cjs';

export const DEFAULT_PLAYWRIGHT_NODE_MODULE_CANDIDATES =
  resolver.DEFAULT_PLAYWRIGHT_NODE_MODULE_CANDIDATES;
export const pickPreferredNodeModulesRoot = resolver.pickPreferredNodeModulesRoot;
export const buildDefaultNodeModulesCandidates = resolver.buildDefaultNodeModulesCandidates;
