import { claudeProviderRegistration } from './claudeRegistration';
import { codexProviderRegistration } from './codexRegistration';

let builtInProvidersRegistered = false;

export const CLAUDIAN_PROVIDER_REGISTRY = {
  claude: claudeProviderRegistration,
  codex: codexProviderRegistration,
};

export function registerBuiltInProviders() {
  if (builtInProvidersRegistered) {
    return CLAUDIAN_PROVIDER_REGISTRY;
  }

  builtInProvidersRegistered = true;
  return CLAUDIAN_PROVIDER_REGISTRY;
}

registerBuiltInProviders();
