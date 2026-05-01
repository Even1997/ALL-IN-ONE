export type MFlowSourceKind = 'knowledge-doc' | 'generated-file' | 'project-file';

export interface MFlowManifest {
  version: number;
  builtAt: string;
  fingerprint: string;
  sourceCount: number;
  episodeCount: number;
  facetCount: number;
  facetPointCount: number;
  entityCount: number;
  edgeCount: number;
}

export interface MFlowSource {
  id: string;
  path: string;
  title: string;
  content: string;
  updatedAt: string;
  kind: MFlowSourceKind;
  summary: string;
  tags: string[];
}

export interface MFlowEpisode {
  id: string;
  sourceId: string;
  path: string;
  title: string;
  content: string;
  summary: string;
  searchText: string;
}

export interface MFlowFacet {
  id: string;
  episodeId: string;
  label: string;
  anchorText: string;
  searchText: string;
}

export interface MFlowFacetPoint {
  id: string;
  episodeId: string;
  facetId: string;
  summary: string;
  searchText: string;
}

export interface MFlowEntity {
  id: string;
  episodeIds: string[];
  name: string;
  searchText: string;
}

export interface MFlowEdge {
  id: string;
  fromId: string;
  toId: string;
  relationshipName: 'has_facet' | 'has_point' | 'involves_entity';
  edgeText: string;
}

export interface MFlowState {
  manifest: MFlowManifest;
  sources: MFlowSource[];
  episodes: MFlowEpisode[];
  facets: MFlowFacet[];
  facetPoints: MFlowFacetPoint[];
  entities: MFlowEntity[];
  edges: MFlowEdge[];
}
