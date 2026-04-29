import {
  createArtifactPath,
  createStateArtifactPath,
  formatSourceLine,
  getArtifactInputSources,
  getSourceChunks,
  slugifyArtifactName,
  summarizeSourceContent,
  truncate,
} from '../common.ts';
import { searchSystemIndex } from '../../systemIndex.ts';
import type { KnowledgeRuntimeAdapter } from '../../runtime/types.ts';
import type { SystemIndexData, SystemIndexSourceRecord } from '../../systemIndex.ts';
import { getKnowledgeSkillRuntimeContract } from '../../runtime/skillRuntimeContracts.ts';

const buildRawPage = (index: SystemIndexData, source: SystemIndexSourceRecord) =>
  [
    `# Raw: ${source.title}`,
    '',
    'Status: captured',
    `Source: ${source.path}`,
    `Kind: ${source.kind}`,
    `Tags: ${source.tags.join(', ') || 'none'}`,
    `Summary: ${source.summary || 'No summary'}`,
    '',
    '## Source Excerpts',
    '',
    summarizeSourceContent(index, source, 6) || 'No source chunks are available yet.',
  ].join('\n');

const buildWikiPage = (index: SystemIndexData, source: SystemIndexSourceRecord) => {
  const chunks = getSourceChunks(index, source);
  return [
    `# ${source.title.replace(/\.[a-z0-9]+$/i, '') || source.title}`,
    '',
    'Status: draft',
    'Sources:',
    `- ${source.path}`,
    `- _goodnight/outputs/llmwiki/raw/${slugifyArtifactName(source)}`,
    '',
    '## Summary',
    '',
    source.summary || chunks[0]?.summary || 'No summary is available yet.',
    '',
    '## Key Points',
    '',
    ...(chunks.length > 0 ? chunks.slice(0, 4).map((chunk) => `- ${chunk.summary} Source: ${source.path}`) : ['- No indexed notes yet.']),
    '',
    '## Related Concepts',
    '',
    `- ${source.kind}`,
    ...source.tags.map((tag) => `- ${tag}`),
    '',
    '## Open Questions',
    '',
    '- None recorded yet.',
  ].join('\n');
};

const buildCoverageLine = (source: SystemIndexSourceRecord) =>
  `- ${source.path} -> raw/${slugifyArtifactName(source)} -> wiki/${slugifyArtifactName(source)}`;

const buildNeedsReviewLines = (sources: SystemIndexSourceRecord[]) => {
  const lines = sources
    .filter((source) => !source.summary)
    .map((source) => `- ${source.path} has no source summary yet.`);

  return lines.length > 0 ? lines : ['- No immediate review items.'];
};

const isGeneratedLlmwikiWikiPage = (source: SystemIndexSourceRecord) =>
  source.kind === 'generated-file' &&
  source.path.startsWith('_goodnight/outputs/llmwiki/wiki/') &&
  source.path.endsWith('.md');

const buildPromptWikiPageReference = (index: SystemIndexData, source: SystemIndexSourceRecord) => {
  if (isGeneratedLlmwikiWikiPage(source)) {
    return [
      `wiki_page: ${source.path}`,
      `source: ${source.path}`,
      `summary: ${source.summary || 'No summary'}`,
      truncate(summarizeSourceContent(index, source, 6) || source.summary || 'No indexed wiki content is available yet.', 1200),
    ].join('\n');
  }

  return [
    `wiki_page: _goodnight/outputs/llmwiki/wiki/${slugifyArtifactName(source)}`,
    `source: ${source.path}`,
    `summary: ${source.summary || 'No summary'}`,
    truncate(buildWikiPage(index, source), 1200),
  ].join('\n');
};

const buildIndexPage = (index: SystemIndexData, artifactSources: SystemIndexSourceRecord[]) =>
  [
    '# LLMWiki Index',
    '',
    `Built at: ${index.manifest.builtAt}`,
    `Fingerprint: ${index.manifest.fingerprint}`,
    '',
    '## Draft Pages',
    '',
    ...artifactSources.map((source) => `- [${source.title}](wiki/${slugifyArtifactName(source)}) - ${source.summary || source.path}`),
    '',
    '## Source Coverage',
    '',
    ...artifactSources.map(buildCoverageLine),
    '',
    '## Needs Review',
    '',
    ...buildNeedsReviewLines(artifactSources),
  ].join('\n');

const buildManifestPage = (index: SystemIndexData) =>
  [
    '# LLMWiki Manifest',
    '',
    `Method: llmwiki`,
    `Built at: ${index.manifest.builtAt}`,
    `Fingerprint: ${index.manifest.fingerprint}`,
    `Sources: ${index.manifest.sourceCount}`,
    '',
    '## Contract',
    '',
    '- Capture raw source material as Markdown pages.',
    '- Compile stable wiki pages as Markdown pages.',
    '- Use JSON only inside the base index, not as the model-facing LLMWiki surface.',
  ].join('\n');

export const llmwikiAdapter: KnowledgeRuntimeAdapter = {
  method: 'llmwiki',
  buildArtifacts: ({ index, vaultPath }) => {
    const contract = getKnowledgeSkillRuntimeContract('llmwiki');
    const artifactSources = getArtifactInputSources(index);
    const sourceArtifacts = artifactSources.flatMap((source) => {
      const fileName = slugifyArtifactName(source);
      return [
        {
          path: createArtifactPath(vaultPath, 'llmwiki', 'raw', fileName),
          content: buildRawPage(index, source),
        },
        {
          path: createArtifactPath(vaultPath, 'llmwiki', 'wiki', fileName),
          content: buildWikiPage(index, source),
        },
      ];
    });

    return [
      ...sourceArtifacts,
      {
        path: createArtifactPath(vaultPath, 'llmwiki', 'index.md'),
        content: buildIndexPage(index, artifactSources),
      },
      {
        path: createArtifactPath(vaultPath, 'llmwiki', 'log.md'),
        content: [
          '# LLM Wiki Build Log',
          '',
          `Skill: ${contract.skillId}`,
          `Project: ${index.manifest.projectName}`,
          `Sources: ${index.manifest.sourceCount}`,
          `Chunks: ${index.manifest.chunkCount}`,
          `Fingerprint: ${index.manifest.fingerprint}`,
        ].join('\n'),
      },
      {
        path: createStateArtifactPath(vaultPath, 'llmwiki', 'manifest.md'),
        content: buildManifestPage(index),
      },
    ];
  },
  buildPromptContext: ({ index, userInput }) => {
    const contract = getKnowledgeSkillRuntimeContract('llmwiki');
    const matches = searchSystemIndex(index, userInput, 6);
    const sources = [...new Set(matches.map((match) => match.source.id))]
      .map((id) => index.sources.find((source) => source.id === id))
      .filter((source): source is SystemIndexSourceRecord => Boolean(source))
      .slice(0, 5);
    const selectedSources = sources.length > 0 ? sources : index.sources.slice(0, 5);

    return {
      labels: [`${contract.skillName} / ${index.manifest.sourceCount} sources`, `wiki pages / ${selectedSources.length}`],
      indexSection: selectedSources.map(formatSourceLine).join('\n'),
      expandedSection: [
        `${contract.contextSection}:`,
        ...selectedSources.map((source) => buildPromptWikiPageReference(index, source)),
      ].join('\n\n'),
      policySection: contract.promptPolicy,
    };
  },
};
