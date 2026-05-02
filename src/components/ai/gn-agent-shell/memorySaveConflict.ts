import type { AgentMemoryEntry } from '../../../modules/ai/runtime/agentRuntimeTypes';

const normalizeTitle = (value: string) => value.trim();

const normalizeTitleKey = (value: string) => normalizeTitle(value).toLocaleLowerCase();

const readEntryTitle = (entry: Pick<AgentMemoryEntry, 'title' | 'label'>) =>
  normalizeTitle(entry.title || entry.label || '');

export const findMemoryEntryByTitle = (
  entries: AgentMemoryEntry[],
  title: string
): AgentMemoryEntry | null => {
  const normalizedKey = normalizeTitleKey(title);
  if (!normalizedKey) {
    return null;
  }

  return entries.find((entry) => normalizeTitleKey(readEntryTitle(entry)) === normalizedKey) || null;
};

export const buildAutoRenamedMemoryTitle = (
  entries: AgentMemoryEntry[],
  preferredTitle: string
) => {
  const normalizedPreferredTitle = normalizeTitle(preferredTitle);
  if (!normalizedPreferredTitle) {
    return '';
  }

  const occupiedKeys = new Set(entries.map((entry) => normalizeTitleKey(readEntryTitle(entry))));
  if (!occupiedKeys.has(normalizeTitleKey(normalizedPreferredTitle))) {
    return normalizedPreferredTitle;
  }

  let suffix = 2;
  while (occupiedKeys.has(normalizeTitleKey(`${normalizedPreferredTitle} ${suffix}`))) {
    suffix += 1;
  }

  return `${normalizedPreferredTitle} ${suffix}`;
};
