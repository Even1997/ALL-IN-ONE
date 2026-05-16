export type FileCapability = 'preview' | 'edit' | 'reference' | 'system-open';

export type DocumentProjectionBlockKind =
  | 'paragraph'
  | 'heading'
  | 'list-item'
  | 'table'
  | 'sheet'
  | 'slide'
  | 'page'
  | 'image'
  | 'code'
  | 'text'
  | 'unknown';

export type DocumentProjectionBlock = {
  id: string;
  anchor: string;
  kind: DocumentProjectionBlockKind;
  title?: string;
  text?: string;
  rows?: string[][];
  sheetName?: string;
  slideIndex?: number;
  notes?: string;
};

export type DocumentProjection = {
  id: string;
  sourcePath: string;
  title: string;
  fileType: string;
  capabilities: FileCapability[];
  blocks: DocumentProjectionBlock[];
  markdown: string;
  updatedAt: string;
};

export type SelectionProjection = {
  id: string;
  sourceDocumentId: string;
  title: string;
  text: string;
  anchor: string;
  markdown: string;
  updatedAt: string;
};

export type FileWorkbenchViewModel = {
  path: string;
  title: string;
  kind:
    | 'markdown'
    | 'code'
    | 'image'
    | 'pdf'
    | 'word'
    | 'sheet'
    | 'slide'
    | 'text'
    | 'binary';
  state: 'loading' | 'ready' | 'error';
  draftContent: string;
  savedContent: string;
  projection: DocumentProjection | null;
  previewUrl?: string;
  errorMessage?: string;
  imageMeta?: {
    width: number;
    height: number;
    mimeType: string;
  } | null;
  pdfMeta?: {
    pageCount: number | null;
  } | null;
};
