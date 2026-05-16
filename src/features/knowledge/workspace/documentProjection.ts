// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { ReferenceFile } from '../../../modules/knowledge/referenceFiles.ts';
import type {
  DocumentProjection,
  DocumentProjectionBlock,
  FileWorkbenchViewModel,
  SelectionProjection,
} from './documentWorkbenchTypes.ts';
import { loadWordDocumentTextContent, migrateLegacyDocToDocx } from './wordDocumentInterop.ts';

const textDecoder = new TextDecoder('utf-8');

const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  dataStart: number;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/[^a-z0-9\u4e00-\u9fa5/_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
};

const summarizeText = (value: string, maxLength = 160) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const normalizeText = (value: string) => value.replace(/\u0000/g, '').replace(/\r\n/g, '\n');

const getFileExtension = (filePath: string) => {
  const match = filePath.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

const xmlDocument = (source: string) => new DOMParser().parseFromString(source, 'application/xml');

const getXmlAttribute = (element: Element | null, suffix: string) => {
  if (!element) {
    return '';
  }

  for (const attribute of element.getAttributeNames()) {
    if (attribute === suffix || attribute.endsWith(`:${suffix}`)) {
      return element.getAttribute(attribute) || '';
    }
  }

  return '';
};

const getElementsBySuffix = (root: ParentNode, suffix: string) =>
  Array.from(root.querySelectorAll('*')).filter(
    (node): node is Element => node instanceof Element && (node.tagName === suffix || node.tagName.endsWith(`:${suffix}`))
  );

const getNodeTextBySuffix = (root: ParentNode, suffix: string) =>
  getElementsBySuffix(root, suffix)
    .map((element) => element.textContent || '')
    .join('');

const cellReferenceToIndex = (reference: string) => {
  const match = /^([A-Z]+)(\d+)$/i.exec(reference.trim());
  if (!match) {
    return { row: 0, column: 0 };
  }

  const letters = match[1].toUpperCase();
  const row = Math.max(Number.parseInt(match[2], 10) - 1, 0);
  let column = 0;
  for (let index = 0; index < letters.length; index += 1) {
    column = column * 26 + (letters.charCodeAt(index) - 64);
  }

  return { row, column: Math.max(column - 1, 0) };
};

const createEmptyMatrix = (rows: number, columns: number) =>
  Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''));

const markdownFromBlocks = (title: string, blocks: DocumentProjectionBlock[]) =>
  [
    `# ${title}`,
    '',
    ...blocks.flatMap((block) => {
      if (block.kind === 'table' && block.rows) {
        const rows = block.rows.filter((row) => row.some((cell) => cell.trim().length > 0));
        if (rows.length === 0) {
          return [];
        }
        const header = rows[0];
        const divider = header.map(() => '---');
        const body = rows.slice(1);
        return [
          block.title ? `## ${block.title}` : '',
          `<!-- ${block.anchor} -->`,
          `| ${header.join(' | ')} |`,
          `| ${divider.join(' | ')} |`,
          ...body.map((row) => `| ${row.join(' | ')} |`),
          '',
        ].filter(Boolean);
      }

      if (block.kind === 'sheet' && block.rows) {
        return [
          `## ${block.title || block.sheetName || 'Sheet'}`,
          `<!-- ${block.anchor} -->`,
          ...block.rows.map((row) => row.join(' | ')),
          '',
        ];
      }

      if (block.kind === 'slide') {
        return [
          `## ${block.title || `Slide ${block.slideIndex || ''}`}`.trim(),
          `<!-- ${block.anchor} -->`,
          block.text || '',
          block.notes ? `Notes: ${block.notes}` : '',
          '',
        ].filter(Boolean);
      }

      if (block.kind === 'heading') {
        return [`## ${block.text || block.title || ''}`, `<!-- ${block.anchor} -->`, ''];
      }

      if (block.kind === 'list-item') {
        return [`- ${block.text || ''}`, `<!-- ${block.anchor} -->`, ''];
      }

      return [block.text || block.title || '', `<!-- ${block.anchor} -->`, ''].filter(Boolean);
    }),
  ].join('\n');

const buildProjection = (
  sourcePath: string,
  title: string,
  fileType: string,
  blocks: DocumentProjectionBlock[],
  capabilities: DocumentProjection['capabilities'],
): DocumentProjection => ({
  id: `pag-doc:${hashString(sourcePath)}`,
  sourcePath,
  title,
  fileType,
  capabilities,
  blocks,
  markdown: markdownFromBlocks(title, blocks),
  updatedAt: new Date().toISOString(),
});

const streamToUint8Array = async (stream: ReadableStream<Uint8Array>) => {
  const response = new Response(stream);
  return new Uint8Array(await response.arrayBuffer());
};

const inflateRaw = async (bytes: Uint8Array) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return streamToUint8Array(stream);
};

const readZipEntries = async (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  let endOffset = -1;

  for (let index = buffer.byteLength - 22; index >= Math.max(0, buffer.byteLength - 65557); index -= 1) {
    if (view.getUint32(index, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      endOffset = index;
      break;
    }
  }

  if (endOffset < 0) {
    throw new Error('Unsupported zip container');
  }

  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const entries = new Map<string, ZipEntry>();
  let pointer = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(pointer, true) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      break;
    }

    const compression = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const uncompressedSize = view.getUint32(pointer + 24, true);
    const fileNameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localHeaderOffset = view.getUint32(pointer + 42, true);
    const fileNameBytes = new Uint8Array(buffer, pointer + 46, fileNameLength);
    const fileName = textDecoder.decode(fileNameBytes);

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;

    entries.set(fileName, {
      name: fileName,
      compression,
      compressedSize,
      uncompressedSize,
      dataStart,
    });

    pointer += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const readZipEntryText = async (buffer: ArrayBuffer, entries: Map<string, ZipEntry>, entryName: string) => {
  const entry = entries.get(entryName);
  if (!entry) {
    return '';
  }

  const bytes = new Uint8Array(buffer, entry.dataStart, entry.compressedSize);
  let output = bytes;
  if (entry.compression === 8) {
    output = await inflateRaw(bytes);
  } else if (entry.compression !== 0) {
    throw new Error(`Unsupported zip compression method: ${entry.compression}`);
  }

  return normalizeText(textDecoder.decode(output));
};

const loadBinaryBuffer = async (filePath: string) => {
  try {
    const bytes = await invoke<number[]>('read_binary_file', { filePath });
    return new Uint8Array(bytes).buffer;
  } catch (error) {
    const response = await fetch(convertFileSrc(filePath));
    if (!response.ok) {
      throw error instanceof Error ? error : new Error(`Failed to load ${filePath}`);
    }

    return response.arrayBuffer();
  }
};

const loadTextContent = async (filePath: string) => {
  try {
    const content = await invoke<string>('read_text_file', { filePath });
    return normalizeText(content);
  } catch (error) {
    const response = await fetch(convertFileSrc(filePath));
    if (!response.ok) {
      throw error instanceof Error ? error : new Error(`Failed to load ${filePath}`);
    }
    return normalizeText(await response.text());
  }
};

export const buildTextProjection = (sourcePath: string, title: string, fileType: string, text: string) =>
  buildProjection(
    sourcePath,
    title,
    fileType,
    text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph, index) => ({
        id: `${fileType}-p-${index + 1}`,
        anchor: `p-${index + 1}`,
        kind: index === 0 ? 'heading' : 'paragraph',
        text: paragraph,
      })),
    ['preview', 'edit', 'reference', 'system-open'],
  );

const parsePptxProjection = async (filePath: string, title: string, buffer: ArrayBuffer) => {
  const entries = await readZipEntries(buffer);
  const slideNames = [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftIndex = Number.parseInt(left.match(/slide(\d+)/i)?.[1] || '0', 10);
      const rightIndex = Number.parseInt(right.match(/slide(\d+)/i)?.[1] || '0', 10);
      return leftIndex - rightIndex;
    });

  const blocks: DocumentProjectionBlock[] = [];
  for (const slideName of slideNames) {
    const slideIndex = Number.parseInt(slideName.match(/slide(\d+)/i)?.[1] || '0', 10);
    const slideXml = await readZipEntryText(buffer, entries, slideName);
    const noteXml = await readZipEntryText(buffer, entries, `ppt/notesSlides/notesSlide${slideIndex}.xml`);
    const slideDoc = xmlDocument(slideXml);
    const textNodes = getElementsBySuffix(slideDoc, 't')
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean);
    const titleText = textNodes[0] || `Slide ${slideIndex}`;
    const bodyText = textNodes.slice(1).join('\n');
    const notesText = getElementsBySuffix(xmlDocument(noteXml), 't')
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean)
      .join('\n');

    blocks.push({
      id: `pptx-slide-${slideIndex}`,
      anchor: `slide-${slideIndex}`,
      kind: 'slide',
      title: titleText,
      text: bodyText,
      notes: notesText,
      slideIndex,
    });
  }

  return buildProjection(filePath, title, 'pptx', blocks, ['preview', 'edit', 'reference', 'system-open']);
};

const parseWorkbookSheets = async (buffer: ArrayBuffer, entries: Map<string, ZipEntry>) => {
  const workbookXml = await readZipEntryText(buffer, entries, 'xl/workbook.xml');
  const relsXml = await readZipEntryText(buffer, entries, 'xl/_rels/workbook.xml.rels');
  const sharedStringsXml = await readZipEntryText(buffer, entries, 'xl/sharedStrings.xml');
  const workbookDoc = xmlDocument(workbookXml);
  const relsDoc = xmlDocument(relsXml);
  const sharedStringValues = getElementsBySuffix(xmlDocument(sharedStringsXml), 'si').map((item) =>
    getElementsBySuffix(item, 't')
      .map((node) => node.textContent || '')
      .join('')
  );
  const relationshipById = new Map(
    getElementsBySuffix(relsDoc, 'Relationship').map((relationship) => [
      getXmlAttribute(relationship, 'Id'),
      getXmlAttribute(relationship, 'Target'),
    ]),
  );

  const sheets = [];
  for (const sheet of getElementsBySuffix(workbookDoc, 'sheet')) {
    const name = getXmlAttribute(sheet, 'name') || 'Sheet';
    const relationshipId = getXmlAttribute(sheet, 'id');
    const target = relationshipById.get(relationshipId);
    if (!target) {
      continue;
    }

    const normalizedTarget = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\/+/, '')}`;
    const sheetXml = await readZipEntryText(buffer, entries, normalizedTarget);
    const sheetDoc = xmlDocument(sheetXml);
    const cells = getElementsBySuffix(sheetDoc, 'c');
    const maxRow = Math.max(
      1,
      ...cells.map((cell) => cellReferenceToIndex(getXmlAttribute(cell, 'r')).row + 1),
    );
    const maxColumn = Math.max(
      1,
      ...cells.map((cell) => cellReferenceToIndex(getXmlAttribute(cell, 'r')).column + 1),
    );
    const matrix = createEmptyMatrix(Math.min(maxRow, 50), Math.min(maxColumn, 20));

    cells.forEach((cell) => {
      const ref = getXmlAttribute(cell, 'r');
      const { row, column } = cellReferenceToIndex(ref);
      if (row >= matrix.length || column >= matrix[0].length) {
        return;
      }

      const type = getXmlAttribute(cell, 't');
      const valueNode = getElementsBySuffix(cell, 'v')[0] || null;
      const inlineNode = getElementsBySuffix(cell, 'is')[0] || null;
      const formulaNode = getElementsBySuffix(cell, 'f')[0] || null;
      const rawValue = valueNode?.textContent || '';

      let value = rawValue;
      if (formulaNode?.textContent) {
        value = `=${formulaNode.textContent}`;
      } else if (type === 's') {
        value = sharedStringValues[Number.parseInt(rawValue || '0', 10)] || '';
      } else if (type === 'inlineStr') {
        value = getNodeTextBySuffix(inlineNode || cell, 't');
      }

      matrix[row][column] = value;
    });

    sheets.push({ name, rows: matrix });
  }

  return sheets;
};

const parseXlsxProjection = async (filePath: string, title: string, buffer: ArrayBuffer) => {
  const entries = await readZipEntries(buffer);
  const sheets = await parseWorkbookSheets(buffer, entries);
  return buildProjection(
    filePath,
    title,
    'xlsx',
    sheets.map((sheet, index) => ({
      id: `sheet-${index + 1}`,
      anchor: `sheet-${index + 1}`,
      kind: 'sheet',
      title: sheet.name,
      sheetName: sheet.name,
      rows: sheet.rows,
    })),
    ['preview', 'edit', 'reference', 'system-open'],
  );
};

const parseCsvRows = (source: string) => {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);
  return rows.filter((row) => row.some((cell) => cell.length > 0));
};

const parseCsvProjection = (filePath: string, title: string, source: string) =>
  buildProjection(
    filePath,
    title,
    'csv',
    [
      {
        id: 'sheet-1',
        anchor: 'sheet-1',
        kind: 'sheet',
        title,
        sheetName: title,
        rows: parseCsvRows(source).slice(0, 50).map((row) => row.slice(0, 20)),
      },
    ],
    ['preview', 'edit', 'reference', 'system-open'],
  );

export const buildProjectionReferenceFile = (
  projection: DocumentProjection,
  options?: {
    id?: string;
    title?: string;
    content?: string;
    sourcePath?: string;
  },
): ReferenceFile => ({
  id: options?.id || projection.id,
  path: options?.sourcePath || projection.sourcePath,
  title: options?.title || projection.title,
  content: options?.content || projection.markdown,
  type: 'md',
  group: 'project',
  source: 'derived',
  updatedAt: projection.updatedAt,
  readableByAI: true,
  summary: summarizeText(options?.content || projection.markdown, 180),
  relatedIds: [projection.id],
  tags: ['pag-document', projection.fileType],
});

export const buildSelectionProjection = (
  projection: DocumentProjection,
  selectedText: string,
  anchor = 'selection',
): SelectionProjection => {
  const trimmedText = selectedText.trim();
  const title = `${projection.title} excerpt`;
  return {
    id: `${projection.id}:selection:${hashString(`${anchor}:${trimmedText}`)}`,
    sourceDocumentId: projection.id,
    title,
    text: trimmedText,
    anchor,
    markdown: `# ${title}\n\nSource: ${projection.title}\nAnchor: ${anchor}\n\n${trimmedText}`,
    updatedAt: new Date().toISOString(),
  };
};

export const buildSelectionReferenceFile = (
  projection: DocumentProjection,
  selection: SelectionProjection,
): ReferenceFile =>
  buildProjectionReferenceFile(projection, {
    id: selection.id,
    title: selection.title,
    content: selection.markdown,
    sourcePath: `${projection.sourcePath}#${selection.anchor}`,
  });

export const buildProjectionArtifactRelativePaths = (sourcePath: string) => {
  const baseName = `${slugify(sourcePath.replace(/^[A-Za-z]:/i, '').replace(/\//g, '_')) || 'document'}-${hashString(sourcePath)}`;
  return {
    json: `.goodnight/pag-projections/${baseName}.projection.json`,
    markdown: `.goodnight/pag-projections/${baseName}.projection.md`,
  };
};

export const loadWorkbenchFileModel = async (filePath: string, title: string): Promise<FileWorkbenchViewModel> => {
  const extension = getFileExtension(filePath);

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(extension)) {
    const image = new Image();
    const previewUrl = convertFileSrc(filePath);
    const imageMeta = await new Promise<FileWorkbenchViewModel['imageMeta']>((resolve) => {
      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          mimeType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        });
      };
      image.onerror = () => resolve(null);
      image.src = previewUrl;
    });

    const projection = buildProjection(
      filePath,
      title,
      extension,
      [
        {
          id: 'image-1',
          anchor: 'image-1',
          kind: 'image',
          text: `Image file ${title}`,
        },
      ],
      ['preview', 'reference', 'system-open'],
    );

    return {
      path: filePath,
      title,
      kind: 'image',
      state: 'ready',
      draftContent: '',
      savedContent: '',
      projection,
      previewUrl,
      imageMeta,
    };
  }

  if (extension === 'pdf') {
    const projection = buildProjection(
      filePath,
      title,
      'pdf',
      [
        {
          id: 'page-1',
          anchor: 'page-1',
          kind: 'page',
          text: `PDF preview available for ${title}. Use system open for full fidelity when needed.`,
        },
      ],
      ['preview', 'reference', 'system-open'],
    );

    return {
      path: filePath,
      title,
      kind: 'pdf',
      state: 'ready',
      draftContent: '',
      savedContent: '',
      projection,
      previewUrl: convertFileSrc(filePath),
      pdfMeta: {
        pageCount: null,
      },
    };
  }

  if (extension === 'doc' || extension === 'docx') {
    const editablePath = extension === 'doc' ? await migrateLegacyDocToDocx(filePath) : filePath;
    const source = await loadWordDocumentTextContent(editablePath);
    const projection = buildTextProjection(editablePath, title, extension, source);
    projection.capabilities = ['preview', 'reference', 'system-open'];

    return {
      path: editablePath,
      title,
      kind: 'word',
      state: 'ready',
      draftContent: source,
      savedContent: source,
      projection,
    };
  }

  if (extension === 'pptx' || extension === 'xlsx') {
    const buffer = await loadBinaryBuffer(filePath);
    const projection =
      extension === 'pptx' ? await parsePptxProjection(filePath, title, buffer) : await parseXlsxProjection(filePath, title, buffer);

    return {
      path: filePath,
      title,
      kind: extension === 'pptx' ? 'slide' : 'sheet',
      state: 'ready',
      draftContent: projection.markdown,
      savedContent: projection.markdown,
      projection,
    };
  }

  if (extension === 'csv') {
    const source = await loadTextContent(filePath);
    const projection = parseCsvProjection(filePath, title, source);
    return {
      path: filePath,
      title,
      kind: 'sheet',
      state: 'ready',
      draftContent: projection.markdown,
      savedContent: projection.markdown,
      projection,
    };
  }

  if (['md', 'markdown', 'txt', 'json', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'yml', 'yaml'].includes(extension)) {
    const source = await loadTextContent(filePath);
    const kind = extension === 'md' || extension === 'markdown' ? 'markdown' : ['txt', 'json', 'yml', 'yaml'].includes(extension) ? 'text' : 'code';
    const projection = buildTextProjection(filePath, title, extension || 'text', source);
    return {
      path: filePath,
      title,
      kind,
      state: 'ready',
      draftContent: source,
      savedContent: source,
      projection,
    };
  }

  return {
    path: filePath,
    title,
    kind: 'binary',
    state: 'ready',
    draftContent: '',
    savedContent: '',
    projection: buildProjection(
      filePath,
      title,
      extension || 'binary',
      [
        {
          id: 'unknown-1',
          anchor: 'unknown-1',
          kind: 'unknown',
          text: `Binary file ${title}. Use system open for editing.`,
        },
      ],
      ['reference', 'system-open'],
    ),
  };
};
