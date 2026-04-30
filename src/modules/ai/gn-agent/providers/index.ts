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

