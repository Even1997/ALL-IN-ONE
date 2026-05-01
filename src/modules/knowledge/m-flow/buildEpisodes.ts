import type { MFlowEpisode, MFlowSource } from './model.ts';
import { slugifyMFlowPart } from './shared.ts';

export const buildEpisodes = (sources: MFlowSource[]): MFlowEpisode[] =>
  sources.map((source) => ({
    id: `episode:${slugifyMFlowPart(source.path)}`,
    sourceId: source.id,
    path: source.path,
    title: source.title,
    content: source.content,
    summary: source.summary,
    searchText: [source.title, source.summary, source.content].filter(Boolean).join('\n'),
  }));
