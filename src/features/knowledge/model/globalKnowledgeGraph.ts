import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeNeighborhoodGraph,
  KnowledgeNote,
} from './knowledge';

type EdgeCandidate = KnowledgeGraphEdge & {
  score: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSourceDirectory = (note: KnowledgeNote) => {
  const sourceUrl = note.sourceUrl || '';
  if (!sourceUrl.includes('/')) {
    return '';
  }

  return sourceUrl.replace(/\/[^/]+$/, '');
};

const toGlobalGraphDepth = (note: KnowledgeNote) => {
  if (note.docType === 'wiki-index') {
    return 0;
  }

  if (note.docType === 'ai-summary') {
    return 1;
  }

  if (note.kind === 'sketch' || note.kind === 'design') {
    return 2;
  }

  return 3;
};

const buildCandidateEdge = (left: KnowledgeNote, right: KnowledgeNote): EdgeCandidate | null => {
  const sharedTags = left.tags.filter((tag) => right.tags.includes(tag)).length;
  const sameDocType = Boolean(left.docType && left.docType === right.docType);
  const sameKind = Boolean(left.kind && left.kind === right.kind);
  const sameSourceDirectory = Boolean(
    getSourceDirectory(left) &&
    getSourceDirectory(left) === getSourceDirectory(right)
  );

  if (!sharedTags && !sameDocType && !sameKind && !sameSourceDirectory) {
    return null;
  }

  const score = clamp(
    sharedTags * 0.36 +
      (sameDocType ? 0.24 : 0) +
      (sameSourceDirectory ? 0.18 : 0) +
      (sameKind ? 0.12 : 0),
    0.18,
    0.92
  );

  if (sharedTags > 0) {
    return {
      sourceId: left.id,
      targetId: right.id,
      edgeType: 'shared-tag',
      strength: score,
      sharedTagCount: sharedTags,
      similarityScore: null,
      score,
    };
  }

  if (sameDocType) {
    return {
      sourceId: left.id,
      targetId: right.id,
      edgeType: 'doc-type',
      strength: score,
      sharedTagCount: sharedTags,
      similarityScore: null,
      score,
    };
  }

  if (sameSourceDirectory) {
    return {
      sourceId: left.id,
      targetId: right.id,
      edgeType: 'source-path',
      strength: score,
      sharedTagCount: sharedTags,
      similarityScore: null,
      score,
    };
  }

  return {
    sourceId: left.id,
    targetId: right.id,
    edgeType: 'kind',
    strength: score,
    sharedTagCount: sharedTags,
    similarityScore: null,
    score,
  };
};

export const buildGlobalKnowledgeGraph = (
  notes: KnowledgeNote[]
): KnowledgeNeighborhoodGraph | null => {
  if (notes.length === 0) {
    return null;
  }

  const nodes: KnowledgeGraphNode[] = notes.map((note) => ({
    ...note,
    depth: toGlobalGraphDepth(note),
  }));

  const candidates: EdgeCandidate[] = [];
  for (let index = 0; index < notes.length; index += 1) {
    for (let innerIndex = index + 1; innerIndex < notes.length; innerIndex += 1) {
      const candidate = buildCandidateEdge(notes[index], notes[innerIndex]);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((left, right) => right.score - left.score);

  const edges: KnowledgeGraphEdge[] = [];
  const degreeByNodeId = new Map<string, number>();
  const degreeLimit = 4;

  candidates.forEach((candidate) => {
    const sourceDegree = degreeByNodeId.get(candidate.sourceId) || 0;
    const targetDegree = degreeByNodeId.get(candidate.targetId) || 0;
    if (sourceDegree >= degreeLimit || targetDegree >= degreeLimit) {
      return;
    }

    edges.push({
      sourceId: candidate.sourceId,
      targetId: candidate.targetId,
      edgeType: candidate.edgeType,
      strength: candidate.strength,
      sharedTagCount: candidate.sharedTagCount,
      similarityScore: candidate.similarityScore,
    });
    degreeByNodeId.set(candidate.sourceId, sourceDegree + 1);
    degreeByNodeId.set(candidate.targetId, targetDegree + 1);
  });

  if (edges.length === 0 && nodes.length > 1) {
    const wikiNodes = nodes.filter((node) => node.docType === 'wiki-index');
    const anchors = wikiNodes.length > 0 ? wikiNodes : [nodes[0]];

    anchors.forEach((anchor) => {
      nodes.forEach((node) => {
        if (node.id === anchor.id || edges.some((edge) => edge.sourceId === anchor.id && edge.targetId === node.id)) {
          return;
        }

        edges.push({
          sourceId: anchor.id,
          targetId: node.id,
          edgeType: 'project-outline',
          strength: 0.24,
          sharedTagCount: 0,
          similarityScore: null,
        });
      });
    });
  }

  return {
    centerNoteId: '',
    nodes,
    edges,
  };
};
