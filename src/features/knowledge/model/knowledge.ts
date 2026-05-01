export type KnowledgeNote = {
  id: string;
  title: string;
  bodyMarkdown: string;
  createdAt?: string;
  updatedAt: string;
  docType?: 'wiki-index' | 'ai-summary';
  tags: string[];
  referenceTitles: string[];
  kind?: 'note' | 'sketch' | 'design';
  sourceUrl?: string | null;
  matchSnippet?: string | null;
};

export type KnowledgeAttachment = {
  id: string;
  title: string;
  path: string;
  relativePath: string;
  extension: string;
  category: 'pdf' | 'word' | 'sheet' | 'slide' | 'text' | 'other';
};

export type LocalKnowledgeServerConfig = {
  baseUrl: string;
  authToken: string;
};

export type ProjectKnowledgeSource = {
  title: string;
  content: string;
  filePath: string;
  createdAt?: string;
  updatedAt: string;
  tags: string[];
};

export type GoodnightDatabaseInfo = {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  last_opened_at?: string | null;
};

export type GoodnightDatabasesResponse = {
  databases: GoodnightDatabaseInfo[];
  active_id?: string | null;
};

type GoodnightTag = {
  id: string;
  name: string;
};

type GoodnightAtomSummary = {
  id: string;
  title: string;
  snippet: string;
  source_url?: string | null;
  source?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  embedding_status?: string;
  tagging_status?: string;
  embedding_error?: string | null;
  tagging_error?: string | null;
  tags: GoodnightTag[];
};

export type GoodnightAtomWithTags = GoodnightAtomSummary & {
  content: string;
};

export type GoodnightSearchResult = GoodnightAtomWithTags & {
  similarity_score: number;
  matching_chunk_content: string;
  matching_chunk_index: number;
  match_snippet?: string | null;
  match_count?: number | null;
};

export type GoodnightSimilarAtomResult = GoodnightAtomWithTags & {
  similarity_score: number;
  matching_chunk_content: string;
  matching_chunk_index: number;
};

export type KnowledgeGraphNode = KnowledgeNote & {
  depth: number;
};

export type KnowledgeGraphEdge = {
  sourceId: string;
  targetId: string;
  edgeType: string;
  strength: number;
  sharedTagCount: number;
  similarityScore?: number | null;
};

export type KnowledgeNeighborhoodGraph = {
  centerNoteId: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};

export type GoodnightNeighborhoodAtom = GoodnightAtomWithTags & {
  depth: number;
};

export type GoodnightNeighborhoodEdge = {
  source_id: string;
  target_id: string;
  edge_type: string;
  strength: number;
  shared_tag_count: number;
  similarity_score?: number | null;
};

export type GoodnightNeighborhoodGraph = {
  center_atom_id: string;
  atoms: GoodnightNeighborhoodAtom[];
  edges: GoodnightNeighborhoodEdge[];
};

export type GoodnightAtomsResponse = {
  atoms: GoodnightAtomSummary[];
  total_count: number;
  limit: number;
  offset: number;
  next_cursor?: string | null;
  next_cursor_id?: string | null;
};
