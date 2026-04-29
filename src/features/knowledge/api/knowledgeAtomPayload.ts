import type { ProjectKnowledgeSource } from '../model/knowledge';

export const normalizeKnowledgeTagNames = (tags: string[]) =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

export const buildAtomWritePayload = (source: ProjectKnowledgeSource, tagIds: string[]) => ({
  content: source.content,
  source_url: source.filePath.trim() || null,
  published_at: null,
  tag_ids: tagIds,
});
