export type SystemIndexSourceKind = 'knowledge-doc' | 'generated-file' | 'project-file';

export type SystemIndexInputSource = {
  id: string;
  path: string;
  title: string;
  content: string;
  updatedAt: string;
  kind: SystemIndexSourceKind;
  tags?: string[];
  summary?: string;
};

export type SystemIndexSourceRecord = {
  id: string;
  path: string;
  title: string;
  updatedAt: string;
  kind: SystemIndexSourceKind;
  tags: string[];
  summary: string;
  contentHash: string;
  chunkIds: string[];
};

export type SystemIndexChunk = {
  id: string;
  sourceId: string;
  path: string;
  title: string;
  content: string;
  summary: string;
  keywords: string[];
};

export type SystemIndexTopic = {
  id: string;
  label: string;
  keywords: string[];
  sourceIds: string[];
  chunkIds: string[];
};

export type SystemIndexDocIntent = {
  id: 'qa' | 'requirements-doc' | 'feature-doc';
  label: string;
  sourceIds: string[];
  chunkIds: string[];
};

export type SystemIndexManifest = {
  version: number;
  projectId: string;
  projectName: string;
  builtAt: string;
  fingerprint: string;
  sourceCount: number;
  chunkCount: number;
  topicCount: number;
};

export type SystemIndexData = {
  manifest: SystemIndexManifest;
  sources: SystemIndexSourceRecord[];
  chunks: SystemIndexChunk[];
  topics: SystemIndexTopic[];
  docIntents: SystemIndexDocIntent[];
};

export type SystemIndexSearchResult = {
  chunk: SystemIndexChunk;
  source: SystemIndexSourceRecord;
  score: number;
};

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'into',
  'then',
  'them',
  'they',
  'their',
  '用户',
  '系统',
  '一个',
  '以及',
  '当前',
  '可以',
  '根据',
  '实现',
  '进行',
  '需要',
  '使用',
  '相关',
  '文件',
  '内容',
]);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const summarizeText = (value: string, maxLength = 120) => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));

const unique = <T>(items: T[]) => Array.from(new Set(items));

export const hashSystemIndexContent = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const buildFingerprint = (sources: SystemIndexInputSource[]) =>
  hashSystemIndexContent(
    [...sources]
      .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))
      .map((source) =>
        [
          source.path,
          source.title,
          source.updatedAt,
          source.kind,
          source.summary || '',
          normalizeWhitespace(source.content),
        ].join('::')
      )
      .join('\n')
  );

const chunkContent = (content: string) => {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const sections = normalized
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    const next = current ? `${current}\n\n${section}` : section;
    if (next.length <= 800) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (section.length <= 800) {
      current = section;
      continue;
    }

    const lines = section.split('\n');
    let lineBuffer = '';
    for (const line of lines) {
      const appended = lineBuffer ? `${lineBuffer}\n${line}` : line;
      if (appended.length <= 800) {
        lineBuffer = appended;
      } else {
        if (lineBuffer) {
          chunks.push(lineBuffer);
        }
        lineBuffer = line;
      }
    }
    current = lineBuffer;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};

const extractKeywords = (value: string, maxKeywords = 8) => {
  const counts = new Map<string, number>();
  for (const token of tokenize(value)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0], 'zh-CN');
    })
    .slice(0, maxKeywords)
    .map(([token]) => token);
};

const buildDocIntent = (
  id: SystemIndexDocIntent['id'],
  label: string,
  chunks: SystemIndexChunk[],
  sources: SystemIndexSourceRecord[],
  terms: string[]
): SystemIndexDocIntent => {
  const ranked = [...chunks]
    .map((chunk) => {
      const haystack = `${chunk.title} ${chunk.summary} ${chunk.keywords.join(' ')} ${chunk.content}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const chunkIds = ranked.map((item) => item.chunk.id);
  const sourceIds = unique(
    ranked.map((item) => item.chunk.sourceId).filter((sourceId) => sources.some((source) => source.id === sourceId))
  );

  return {
    id,
    label,
    sourceIds,
    chunkIds,
  };
};

export const buildSystemIndex = (options: {
  projectId: string;
  projectName: string;
  builtAt?: string;
  sources: SystemIndexInputSource[];
}): SystemIndexData => {
  const builtAt = options.builtAt || new Date().toISOString();
  const normalizedSources = options.sources
    .map((source) => ({
      ...source,
      path: source.path.replace(/\\/g, '/'),
      title: source.title.trim() || source.path.replace(/\\/g, '/').split('/').pop() || source.id,
      content: source.content || '',
      tags: unique(source.tags || []),
      summary: source.summary?.trim() || summarizeText(source.content),
    }))
    .filter((source) => source.path.trim().length > 0);

  const chunks: SystemIndexChunk[] = [];
  const sources: SystemIndexSourceRecord[] = normalizedSources.map((source) => {
    const sourceKeywords = extractKeywords(`${source.title}\n${source.summary}\n${source.content}`);
    const sourceChunks = chunkContent(source.content);
    const chunkIds: string[] = [];

    sourceChunks.forEach((chunkContentValue, index) => {
      const chunkId = `${source.id}:chunk:${index + 1}`;
      chunkIds.push(chunkId);
      chunks.push({
        id: chunkId,
        sourceId: source.id,
        path: source.path,
        title: source.title,
        content: chunkContentValue,
        summary: summarizeText(chunkContentValue, 180),
        keywords: extractKeywords(`${source.title}\n${chunkContentValue}\n${sourceKeywords.join(' ')}`),
      });
    });

    return {
      id: source.id,
      path: source.path,
      title: source.title,
      updatedAt: source.updatedAt,
      kind: source.kind,
      tags: source.tags,
      summary: source.summary,
      contentHash: hashSystemIndexContent(source.content),
      chunkIds,
    };
  });

  const topicMap = new Map<string, { sourceIds: Set<string>; chunkIds: Set<string>; hits: number }>();
  for (const chunk of chunks) {
    for (const keyword of chunk.keywords.slice(0, 6)) {
      const topic = topicMap.get(keyword) || { sourceIds: new Set<string>(), chunkIds: new Set<string>(), hits: 0 };
      topic.sourceIds.add(chunk.sourceId);
      topic.chunkIds.add(chunk.id);
      topic.hits += 1;
      topicMap.set(keyword, topic);
    }
  }

  const topics: SystemIndexTopic[] = [...topicMap.entries()]
    .filter(([, topic]) => topic.hits >= 1)
    .sort((left, right) => right[1].hits - left[1].hits)
    .slice(0, 24)
    .map(([keyword, topic], index) => ({
      id: `topic:${index + 1}`,
      label: keyword,
      keywords: [keyword],
      sourceIds: [...topic.sourceIds],
      chunkIds: [...topic.chunkIds],
    }));

  const docIntents: SystemIndexDocIntent[] = [
    buildDocIntent('qa', '问答', chunks, sources, ['问题', 'answer', '问答', '知识库', '索引']),
    buildDocIntent('requirements-doc', '需求文档', chunks, sources, ['需求', '目标', '用户', '流程', '场景', 'requirement']),
    buildDocIntent('feature-doc', '功能文档', chunks, sources, ['功能', '模块', '页面', '交互', 'feature', 'spec']),
  ];

  return {
    manifest: {
      version: 1,
      projectId: options.projectId,
      projectName: options.projectName,
      builtAt,
      fingerprint: buildFingerprint(normalizedSources),
      sourceCount: sources.length,
      chunkCount: chunks.length,
      topicCount: topics.length,
    },
    sources,
    chunks,
    topics,
    docIntents,
  };
};

export const searchSystemIndex = (
  index: SystemIndexData,
  query: string,
  maxResults = 8
): SystemIndexSearchResult[] => {
  const tokens = unique(tokenize(query));
  if (tokens.length === 0) {
    return index.chunks.slice(0, maxResults).map((chunk) => ({
      chunk,
      source: index.sources.find((source) => source.id === chunk.sourceId)!,
      score: 0,
    }));
  }

  return index.chunks
    .map((chunk) => {
      const haystack = `${chunk.path} ${chunk.title} ${chunk.summary} ${chunk.keywords.join(' ')} ${chunk.content}`.toLowerCase();
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      const source = index.sources.find((item) => item.id === chunk.sourceId) || null;
      return source ? { chunk, source, score } : null;
    })
    .filter((item): item is SystemIndexSearchResult => item !== null && item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.source.path.localeCompare(right.source.path, 'zh-CN');
    })
    .slice(0, maxResults);
};

const truncateContent = (content: string, maxChars: number) =>
  content.length > maxChars ? `${content.slice(0, maxChars)}\n...[truncated]` : content;

export const buildSystemIndexPromptContext = (
  index: SystemIndexData,
  userInput: string,
  options?: {
    maxSources?: number;
    maxExpandedChunks?: number;
    maxExpandedChars?: number;
  }
) => {
  const matches = searchSystemIndex(index, userInput, Math.max(4, options?.maxSources || 8));
  if (matches.length === 0) {
    return {
      labels: ['系统索引 / 0'],
      indexSection: '',
      expandedSection: '',
    };
  }

  const uniqueSources = unique(matches.map((match) => match.source.id))
    .map((id) => index.sources.find((source) => source.id === id))
    .filter((source): source is SystemIndexSourceRecord => Boolean(source))
    .slice(0, options?.maxSources || 8);
  const expanded = matches.slice(0, options?.maxExpandedChunks || 4);
  const maxExpandedChars = Math.max(600, options?.maxExpandedChars || 3200);

  return {
    labels: [
      `系统索引 / ${index.manifest.sourceCount} sources`,
      `命中块 / ${matches.length}`,
    ],
    indexSection: uniqueSources
      .map((source) => `- ${source.path} | ${source.title} | ${source.summary || 'No summary'} | ${source.kind} | ${source.updatedAt}`)
      .join('\n'),
    expandedSection: expanded
      .map(
        ({ source, chunk }) =>
          `source: ${source.path}\nsummary: ${chunk.summary}\nkeywords: ${chunk.keywords.join(', ') || 'none'}\n${truncateContent(chunk.content, maxExpandedChars)}`
      )
      .join('\n\n'),
  };
};
