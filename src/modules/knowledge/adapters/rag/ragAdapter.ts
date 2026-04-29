import {
  createArtifactPath,
  createStateArtifactPath,
  formatSourceLine,
  getArtifactInputSources,
  getSourceChunks,
  slugifyArtifactName,
  truncate,
} from '../common.ts';
import { buildSystemIndexPromptContext } from '../../systemIndex.ts';
import type { KnowledgeRuntimeAdapter } from '../../runtime/types.ts';
import { getKnowledgeSkillRuntimeContract } from '../../runtime/skillRuntimeContracts.ts';

export const ragAdapter: KnowledgeRuntimeAdapter = {
  method: 'rag',
  buildArtifacts: ({ index, vaultPath }) => {
    const contract = getKnowledgeSkillRuntimeContract('rag');
    const artifactSources = getArtifactInputSources(index);

    return [
      {
        path: createArtifactPath(vaultPath, 'rag', 'retrieval-guide.md'),
        content: [
          '# RAG Retrieval Guide',
          '',
          `Skill: ${contract.skillId}`,
          `Built at: ${index.manifest.builtAt}`,
          `Sources: ${artifactSources.length}`,
          `Chunks: ${index.manifest.chunkCount}`,
          '',
          '## Sources',
          '',
          ...artifactSources.map(formatSourceLine),
        ].join('\n'),
      },
      ...artifactSources.map((source) => ({
        path: createArtifactPath(vaultPath, 'rag', 'source-digests', slugifyArtifactName(source)),
        content: [
          `# Source Digest: ${source.title}`,
          '',
          `Source: ${source.path}`,
          `Kind: ${source.kind}`,
          '',
          source.summary || 'No summary is available yet.',
          '',
          '## Citable Chunks',
          '',
          ...getSourceChunks(index, source)
            .slice(0, 6)
            .map((chunk) => `- ${chunk.id}: ${chunk.summary}`),
        ].join('\n'),
      })),
      {
        path: createStateArtifactPath(vaultPath, 'rag', 'manifest.json'),
        content: JSON.stringify(
          {
            method: 'rag',
            builtAt: index.manifest.builtAt,
            fingerprint: index.manifest.fingerprint,
            chunkCount: index.manifest.chunkCount,
          },
          null,
          2
        ),
      },
    ];
  },
  buildPromptContext: ({ index, userInput }) => {
    const contract = getKnowledgeSkillRuntimeContract('rag');
    const context = buildSystemIndexPromptContext(index, userInput, {
      maxSources: 8,
      maxExpandedChunks: 4,
      maxExpandedChars: 2600,
    });

    return {
      labels: [`${contract.skillName} / ${index.manifest.sourceCount} sources`, ...context.labels],
      indexSection: context.indexSection,
      expandedSection: context.expandedSection ? `${contract.contextSection}:\n${truncate(context.expandedSection, 3200)}` : '',
      policySection: contract.promptPolicy,
    };
  },
};
