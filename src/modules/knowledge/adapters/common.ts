import { joinFileSystemPath } from '../../../utils/fileSystemPaths.ts';
import {
  getVaultSkillOutputsDir,
  getVaultSkillStateDir,
} from '../../../utils/projectPersistence.ts';
import type {
  SystemIndexChunk,
  SystemIndexData,
  SystemIndexSourceRecord,
} from '../systemIndex.ts';

export const createArtifactPath = (vaultPath: string, skill: 'llmwiki' | 'm-flow' | 'rag', ...segments: string[]) =>
  joinFileSystemPath(getVaultSkillOutputsDir(vaultPath, skill), ...segments);

export const createStateArtifactPath = (
  vaultPath: string,
  skill: 'llmwiki' | 'm-flow' | 'rag',
  ...segments: string[]
) => joinFileSystemPath(getVaultSkillStateDir(vaultPath, skill), ...segments);

export const slugifyArtifactName = (source: Pick<SystemIndexSourceRecord, 'path' | 'id'>) => {
  const base = source.path
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${base || source.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'source'}.md`;
};

export const getSourceChunks = (index: SystemIndexData, source: SystemIndexSourceRecord) =>
  source.chunkIds
    .map((chunkId) => index.chunks.find((chunk) => chunk.id === chunkId))
    .filter((chunk): chunk is SystemIndexChunk => Boolean(chunk));

export const isRuntimeOutputSource = (source: SystemIndexSourceRecord) =>
  source.path === '_goodnight' ||
  source.path.startsWith('_goodnight/outputs/') ||
  source.path === '.goodnight' ||
  source.path.startsWith('.goodnight/skills/');

export const getArtifactInputSources = (index: SystemIndexData) =>
  index.sources.filter((source) => !isRuntimeOutputSource(source));

export const summarizeSourceContent = (index: SystemIndexData, source: SystemIndexSourceRecord, maxChunks = 3) =>
  getSourceChunks(index, source)
    .slice(0, maxChunks)
    .map((chunk) => chunk.content.trim())
    .filter(Boolean)
    .join('\n\n');

export const formatSourceLine = (source: SystemIndexSourceRecord) =>
  `- ${source.path} | ${source.title} | ${source.summary || 'No summary'} | ${source.kind} | ${source.updatedAt}`;

export const truncate = (value: string, maxChars: number) =>
  value.length > maxChars ? `${value.slice(0, maxChars)}\n...[truncated]` : value;
