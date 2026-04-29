import {
  createArtifactPath,
  createStateArtifactPath,
  formatSourceLine,
  getArtifactInputSources,
  getSourceChunks,
  slugifyArtifactName,
  truncate,
} from '../common.ts';
import { searchSystemIndex } from '../../systemIndex.ts';
import type { SystemIndexData, SystemIndexSourceRecord } from '../../systemIndex.ts';
import type { KnowledgeRuntimeAdapter } from '../../runtime/types.ts';
import { getKnowledgeSkillRuntimeContract } from '../../runtime/skillRuntimeContracts.ts';

const extractFacet = (source: SystemIndexSourceRecord) => source.tags[0] || source.kind;

const extractEntity = (source: SystemIndexSourceRecord) =>
  source.title.replace(/\.[a-z0-9]+$/i, '') || source.path.split('/').pop() || source.id;

const estimatePathCost = (source: SystemIndexSourceRecord) => {
  if (source.summary && source.tags.length > 0) {
    return 'low';
  }

  return source.summary ? 'medium' : 'high';
};

const buildEpisodePage = (index: SystemIndexData, source: SystemIndexSourceRecord) => {
  const chunks = getSourceChunks(index, source);
  return [
    `# Episode: ${source.title}`,
    '',
    `Source: ${source.path}`,
    `Kind: ${source.kind}`,
    `Facet: ${extractFacet(source)}`,
    `Entity: ${extractEntity(source)}`,
    '',
    '## Moment',
    '',
    source.summary || chunks[0]?.summary || 'No episode summary is available yet.',
    '',
    '## Evidence',
    '',
    ...(chunks.length > 0 ? chunks.slice(0, 4).map((chunk) => `- ${chunk.summary}`) : ['- No evidence chunks are available yet.']),
  ].join('\n');
};

const buildFacetPage = (source: SystemIndexSourceRecord) =>
  [
    `# Facet: ${extractFacet(source)}`,
    '',
    `Primary source: ${source.path}`,
    `Primary entity: ${extractEntity(source)}`,
    '',
    '## Relevance Angle',
    '',
    source.summary || 'No facet summary yet.',
  ].join('\n');

const buildFacetPointPage = (index: SystemIndexData, source: SystemIndexSourceRecord) => {
  const chunks = getSourceChunks(index, source).slice(0, 4);
  return [
    `# FacetPoint: ${source.title}`,
    '',
    `Facet: ${extractFacet(source)}`,
    `Entity: ${extractEntity(source)}`,
    `Source: ${source.path}`,
    '',
    '## Claims',
    '',
    ...(chunks.length > 0 ? chunks.map((chunk) => `- ${chunk.summary}`) : [`- ${source.summary || 'No facet point summary yet.'}`]),
  ].join('\n');
};

const buildEntityPage = (source: SystemIndexSourceRecord) =>
  [
    `# Entity: ${extractEntity(source)}`,
    '',
    `Source: ${source.path}`,
    `Kind: ${source.kind}`,
    `Facet: ${extractFacet(source)}`,
    '',
    '## Linked Memory',
    '',
    `- Episode: _goodnight/outputs/m-flow/episodes/${slugifyArtifactName(source)}`,
    `- FacetPoint: _goodnight/outputs/m-flow/facet-points/${slugifyArtifactName(source)}`,
  ].join('\n');

const buildPathPage = (index: SystemIndexData, source: SystemIndexSourceRecord) => {
  const chunks = getSourceChunks(index, source).slice(0, 3);
  return [
    `# Evidence Path: ${source.title}`,
    '',
    `Question pattern: questions about ${source.summary || source.title}`,
    `Path: question -> facet:${extractFacet(source)} -> facet-point:${source.id} -> entity:${extractEntity(source)} -> source:${source.path}`,
    `Path cost: ${estimatePathCost(source)}`,
    '',
    '## Why Relevant',
    '',
    `Facet ${extractFacet(source)} connects the question to entity ${extractEntity(source)} through source ${source.path}.`,
    '',
    '## Evidence Bundle',
    '',
    ...(chunks.length > 0 ? chunks.map((chunk) => `- ${chunk.summary} Source: ${source.path}`) : ['- No evidence chunks are available yet.']),
    '',
    '## Related Paths',
    '',
    `- _goodnight/outputs/m-flow/entities/${slugifyArtifactName(source)}`,
    `- _goodnight/outputs/m-flow/facets/${slugifyArtifactName(source)}`,
    '',
    '## Gaps',
    '',
    source.summary ? '- None recorded yet.' : '- Source summary is missing; inspect the original source before relying on this path.',
  ].join('\n');
};

const buildGraphPage = (artifactSources: SystemIndexSourceRecord[]) =>
  [
    '# M-Flow Graph',
    '',
    'Scoring rule: rank Episodes by the strongest coherent path, not by average similarity.',
    '',
    '## Nodes',
    '',
    ...artifactSources.flatMap((source) => [
      `- facet:${extractFacet(source)}`,
      `- facet-point:${source.id}`,
      `- entity:${extractEntity(source)}`,
      `- episode:${source.path}`,
    ]),
    '',
    '## Edges',
    '',
    ...artifactSources.flatMap((source) => {
      const facet = extractFacet(source);
      const entity = extractEntity(source);
      return [
        `- facet:${facet} -> facet-point:${source.id} | edge_text: ${source.summary || `Evidence point from ${source.path}`}`,
        `- facet-point:${source.id} -> entity:${entity} | edge_text: This point is anchored by ${entity}.`,
        `- entity:${entity} -> episode:${source.path} | edge_text: ${entity} appears in source episode ${source.path}.`,
      ];
    }),
  ].join('\n');

const buildAnchorsPage = (artifactSources: SystemIndexSourceRecord[]) =>
  [
    '# M-Flow Anchors',
    '',
    ...artifactSources.map(
      (source) =>
        `- ${source.path} | facet:${extractFacet(source)} | facet-point:${source.id} | entity:${extractEntity(source)}`
    ),
  ].join('\n');

const buildPathIndexPage = (artifactSources: SystemIndexSourceRecord[]) =>
  [
    '# M-Flow Path Index',
    '',
    ...artifactSources.map(
      (source) =>
        `- ${source.path} | strongest_path: facet:${extractFacet(source)} -> facet-point:${source.id} -> entity:${extractEntity(source)} -> episode:${source.path} | path_cost: ${estimatePathCost(source)} | artifact: _goodnight/outputs/m-flow/paths/${slugifyArtifactName(source)}`
    ),
  ].join('\n');

export const mFlowAdapter: KnowledgeRuntimeAdapter = {
  method: 'm-flow',
  buildArtifacts: ({ index, vaultPath }) => {
    const contract = getKnowledgeSkillRuntimeContract('m-flow');
    const artifactSources = getArtifactInputSources(index);
    const sourceArtifacts = artifactSources.flatMap((source) => {
      const fileName = slugifyArtifactName(source);
      return [
        {
          path: createArtifactPath(vaultPath, 'm-flow', 'episodes', fileName),
          content: buildEpisodePage(index, source),
        },
        {
          path: createArtifactPath(vaultPath, 'm-flow', 'facets', fileName),
          content: buildFacetPage(source),
        },
        {
          path: createArtifactPath(vaultPath, 'm-flow', 'facet-points', fileName),
          content: buildFacetPointPage(index, source),
        },
        {
          path: createArtifactPath(vaultPath, 'm-flow', 'entities', fileName),
          content: buildEntityPage(source),
        },
        {
          path: createArtifactPath(vaultPath, 'm-flow', 'paths', fileName),
          content: buildPathPage(index, source),
        },
      ];
    });

    return [
      ...sourceArtifacts,
      {
        path: createArtifactPath(vaultPath, 'm-flow', 'index.md'),
        content: [
          '# M-Flow Index',
          '',
          `Skill: ${contract.skillId}`,
          `Built at: ${index.manifest.builtAt}`,
          '',
          ...artifactSources.map(
            (source) =>
              `- ${source.title}: episodes/${slugifyArtifactName(source)} -> paths/${slugifyArtifactName(source)}`
          ),
        ].join('\n'),
      },
      {
        path: createStateArtifactPath(vaultPath, 'm-flow', 'graph.md'),
        content: buildGraphPage(artifactSources),
      },
      {
        path: createStateArtifactPath(vaultPath, 'm-flow', 'anchors.md'),
        content: buildAnchorsPage(artifactSources),
      },
      {
        path: createStateArtifactPath(vaultPath, 'm-flow', 'path-index.md'),
        content: buildPathIndexPage(artifactSources),
      },
    ];
  },
  buildPromptContext: ({ index, userInput }) => {
    const contract = getKnowledgeSkillRuntimeContract('m-flow');
    const matches = searchSystemIndex(index, userInput, 6);
    const sources = [...new Set(matches.map((match) => match.source.id))]
      .map((id) => index.sources.find((source) => source.id === id))
      .filter((source): source is SystemIndexSourceRecord => Boolean(source))
      .slice(0, 5);
    const selectedSources = sources.length > 0 ? sources : index.sources.slice(0, 5);

    return {
      labels: [`${contract.skillName} / ${index.manifest.sourceCount} sources`, `evidence paths / ${selectedSources.length}`],
      indexSection: selectedSources.map(formatSourceLine).join('\n'),
      expandedSection: [
        `${contract.contextSection}:`,
        ...selectedSources.map((source) =>
          [
            `path: _goodnight/outputs/m-flow/paths/${slugifyArtifactName(source)}`,
            `why_relevant: facet ${extractFacet(source)} connects the question to facet-point ${source.id} and entity ${extractEntity(source)}.`,
            `path_cost: ${estimatePathCost(source)}`,
            truncate(buildPathPage(index, source), 1200),
          ].join('\n')
        ),
      ].join('\n\n'),
      policySection: contract.promptPolicy,
    };
  },
};
