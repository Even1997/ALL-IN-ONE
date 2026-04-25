import type { KnowledgeEntry } from './knowledgeEntries';

export type KnowledgeGroupId = 'project' | 'sketch' | 'design';

export type KnowledgeDiskItem = {
  path: string;
  relativePath: string;
  type: 'file' | 'folder';
};

export type KnowledgeTreeNode = {
  id: string;
  label: string;
  type: 'group' | 'folder' | 'file';
  group: KnowledgeGroupId;
  path: string | null;
  relativePath: string | null;
  protected: boolean;
  entryId?: string;
  summary?: string;
  children: KnowledgeTreeNode[];
};

export const SYSTEM_KNOWLEDGE_GROUPS: Array<Pick<KnowledgeTreeNode, 'id' | 'label' | 'group' | 'protected'>> = [
  { id: 'project', label: '项目', group: 'project', protected: true },
  { id: 'sketch', label: '草图', group: 'sketch', protected: true },
  { id: 'design', label: '设计', group: 'design', protected: true },
];

const normalizePath = (value: string) =>
  value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '');

const basename = (value: string) => {
  const normalized = normalizePath(value);
  if (!normalized) {
    return '';
  }

  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
};

const inferGroupFromRelativePath = (relativePath: string): KnowledgeGroupId | null => {
  const normalizedPath = normalizePath(relativePath).toLowerCase();
  if (normalizedPath === 'sketch' || normalizedPath.startsWith('sketch/')) {
    return 'sketch';
  }

  if (normalizedPath === 'design' || normalizedPath.startsWith('design/')) {
    return 'design';
  }

  return null;
};

export const toKnowledgeRelativePath = (rootPath: string | null | undefined, value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  const normalizedValue = normalizePath(value);
  const normalizedRoot = normalizePath(rootPath || '');

  if (normalizedRoot && normalizedValue.startsWith(`${normalizedRoot}/`)) {
    return normalizedValue.slice(normalizedRoot.length + 1);
  }

  if (normalizedRoot && normalizedValue === normalizedRoot) {
    return '';
  }

  return normalizedValue;
};

const classifyKnowledgeEntry = (
  entry: KnowledgeEntry,
  relativePath: string,
  groupOverrides: Record<string, KnowledgeGroupId>
): KnowledgeGroupId => {
  const override = groupOverrides[relativePath];
  if (override) {
    return override;
  }

  const pathGroup = inferGroupFromRelativePath(relativePath);
  if (pathGroup) {
    return pathGroup;
  }

  if (entry.type === 'html' || entry.source === 'generated') {
    return 'design';
  }

  if (entry.kind === 'sketch') {
    return 'sketch';
  }

  return 'project';
};

const createGroupNode = (group: Pick<KnowledgeTreeNode, 'id' | 'label' | 'group' | 'protected'>): KnowledgeTreeNode => ({
  ...group,
  type: 'group',
  path: null,
  relativePath: null,
  children: [],
});

const ensureFolderPath = (
  groupRoot: KnowledgeTreeNode,
  folders: Map<string, KnowledgeTreeNode>,
  diskItemsByRelativePath: Map<string, KnowledgeDiskItem>,
  relativeFolderPath: string
) => {
  const normalizedFolderPath = normalizePath(relativeFolderPath);
  if (!normalizedFolderPath) {
    return groupRoot;
  }

  const segments = normalizedFolderPath.split('/');
  let currentParent = groupRoot;
  let currentPath = '';

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    let folderNode = folders.get(currentPath);

    if (!folderNode) {
      const diskItem = diskItemsByRelativePath.get(currentPath);
      folderNode = {
        id: `folder:${groupRoot.group}:${currentPath}`,
        label: segment,
        type: 'folder',
        group: groupRoot.group,
        path: diskItem?.path || currentPath,
        relativePath: currentPath,
        protected: false,
        children: [],
      };
      folders.set(currentPath, folderNode);
      currentParent.children.push(folderNode);
    }

    currentParent = folderNode;
  }

  return currentParent;
};

const collectAncestorFolderPaths = (relativePath: string) => {
  const normalizedPath = normalizePath(relativePath);
  const segments = normalizedPath.split('/');
  const folders: string[] = [];

  for (let index = 0; index < segments.length - 1; index += 1) {
    folders.push(segments.slice(0, index + 1).join('/'));
  }

  return folders;
};

export const buildKnowledgeTree = (
  entries: KnowledgeEntry[],
  diskItems: KnowledgeDiskItem[],
  rootPath: string | null | undefined,
  groupOverrides: Record<string, KnowledgeGroupId> = {}
) => {
  const roots = new Map<KnowledgeGroupId, KnowledgeTreeNode>(
    SYSTEM_KNOWLEDGE_GROUPS.map((group) => [group.group, createGroupNode(group)])
  );
  const folderMaps = new Map<KnowledgeGroupId, Map<string, KnowledgeTreeNode>>([
    ['project', new Map()],
    ['sketch', new Map()],
    ['design', new Map()],
  ]);
  const diskItemsByRelativePath = new Map(
    diskItems.map((item) => [normalizePath(item.relativePath), item])
  );

  const entryRecords = entries
    .map((entry) => {
      const relativePath = toKnowledgeRelativePath(rootPath, entry.filePath || entry.title);
      if (!relativePath) {
        return null;
      }

      return {
        entry,
        relativePath,
        group: classifyKnowledgeEntry(entry, relativePath, groupOverrides),
      };
    })
    .filter(Boolean) as Array<{ entry: KnowledgeEntry; relativePath: string; group: KnowledgeGroupId }>;

  const fileGroupByRelativePath = new Map(entryRecords.map((record) => [record.relativePath, record.group]));
  const renderedFileKeys = new Set<string>();

  for (const record of entryRecords) {
    const fileKey = `${record.group}:${record.relativePath}`;
    if (renderedFileKeys.has(fileKey)) {
      continue;
    }

    renderedFileKeys.add(fileKey);
    const groupRoot = roots.get(record.group);
    const folderMap = folderMaps.get(record.group);
    if (!groupRoot || !folderMap) {
      continue;
    }

    const parentFolderPath = collectAncestorFolderPaths(record.relativePath).slice(-1)[0] || '';
    const parentNode = ensureFolderPath(groupRoot, folderMap, diskItemsByRelativePath, parentFolderPath);
    const diskItem = diskItemsByRelativePath.get(record.relativePath);

    parentNode.children.push({
      id: `file:${record.group}:${record.relativePath}`,
      label: basename(record.relativePath),
      type: 'file',
      group: record.group,
      path: diskItem?.path || record.entry.filePath || record.relativePath,
      relativePath: record.relativePath,
      protected: false,
      entryId: record.entry.id,
      summary: record.entry.summary,
      children: [],
    });
  }

  const foldersByRelativePath = diskItems.filter((item) => item.type === 'folder');

  for (const folder of foldersByRelativePath) {
    const explicitGroup = groupOverrides[normalizePath(folder.relativePath)];
    const pathGroup = inferGroupFromRelativePath(folder.relativePath);
    const descendantGroups = Array.from(fileGroupByRelativePath.entries())
      .filter(([relativePath]) => relativePath.startsWith(`${normalizePath(folder.relativePath)}/`))
      .map(([, group]) => group);

    const uniqueDescendantGroups = Array.from(new Set(descendantGroups));
    const groupsToRender: KnowledgeGroupId[] =
      explicitGroup
        ? [explicitGroup]
        : pathGroup
          ? [pathGroup]
        : uniqueDescendantGroups.length > 0
          ? uniqueDescendantGroups
          : ['project'];

    for (const group of groupsToRender) {
      const groupRoot = roots.get(group);
      const folderMap = folderMaps.get(group);
      if (!groupRoot || !folderMap) {
        continue;
      }

      ensureFolderPath(groupRoot, folderMap, diskItemsByRelativePath, folder.relativePath);
    }
  }

  const sortNodes = (nodes: KnowledgeTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1;
      }

      return left.label.localeCompare(right.label, 'zh-CN');
    });

    nodes.forEach((node) => sortNodes(node.children));
  };

  const result = SYSTEM_KNOWLEDGE_GROUPS.map((group) => roots.get(group.group)!).filter(Boolean);
  result.forEach((node) => sortNodes(node.children));
  return result;
};

export const findKnowledgeTreeNode = (nodes: KnowledgeTreeNode[], id: string | null): KnowledgeTreeNode | null => {
  if (!id) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const childMatch = findKnowledgeTreeNode(node.children, id);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
};

export const findFirstKnowledgeFileNode = (nodes: KnowledgeTreeNode[]): KnowledgeTreeNode | null => {
  for (const node of nodes) {
    if (node.type === 'file') {
      return node;
    }

    const childMatch = findFirstKnowledgeFileNode(node.children);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
};

export const filterKnowledgeTree = (nodes: KnowledgeTreeNode[], keyword: string): KnowledgeTreeNode[] => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const children = filterKnowledgeTree(node.children, normalizedKeyword);
    const matchesSelf = [node.label, node.summary || '', node.relativePath || '']
      .join('\n')
      .toLowerCase()
      .includes(normalizedKeyword);

    if (node.type === 'group') {
      if (matchesSelf || children.length > 0) {
        return [{ ...node, children }];
      }

      return [];
    }

    if (!matchesSelf && children.length === 0) {
      return [];
    }

    return [{ ...node, children }];
  });
};
