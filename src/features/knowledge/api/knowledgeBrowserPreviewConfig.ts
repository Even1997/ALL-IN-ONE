import type { LocalKnowledgeServerConfig } from '../model/knowledge';

const LOCAL_BROWSER_PREVIEW_HOSTS = new Set(['127.0.0.1', 'localhost']);
const DEFAULT_BROWSER_PREVIEW_BASE_URL = 'http://127.0.0.1:44380';

export const resolveBrowserPreviewKnowledgeServerConfig = (
  href: string
): LocalKnowledgeServerConfig | null => {
  try {
    const url = new URL(href);
    if (!LOCAL_BROWSER_PREVIEW_HOSTS.has(url.hostname)) {
      return null;
    }

    const authToken = url.searchParams.get('knowledgeToken')?.trim();
    if (!authToken) {
      return null;
    }

    const baseUrl = url.searchParams.get('knowledgeBaseUrl')?.trim() || DEFAULT_BROWSER_PREVIEW_BASE_URL;
    return {
      baseUrl,
      authToken,
    };
  } catch {
    return null;
  }
};
