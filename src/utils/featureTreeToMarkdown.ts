import { FeatureNode, FeatureTree } from '../types';

const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `feature-${Math.random().toString(36).slice(2, 10)}`;

const splitPipeValue = (value: string) =>
  value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

const createFeatureNode = (name: string): FeatureNode => ({
  id: createId(),
  name,
  description: '',
  details: [],
  inputs: [],
  outputs: [],
  dependencies: [],
  acceptanceCriteria: [],
  status: 'pending',
  priority: 'medium',
  progress: 0,
  linkedPrototypePageIds: [],
  linkedCodeFiles: [],
  children: [],
});

const collectNodeIds = (nodes: FeatureNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children)]);

export const featureTreeToMarkdown = (tree: FeatureTree): string => {
  const renderNode = (node: FeatureNode, depth: number): string => {
    const indent = '  '.repeat(depth);
    const lines = [`${indent}- ${node.name}`];

    if (node.description) {
      lines.push(`${indent}  描述：${node.description}`);
    }

    if (node.details?.length) {
      lines.push(`${indent}  说明：${node.details.join(' | ')}`);
    }

    if (node.inputs?.length) {
      lines.push(`${indent}  输入：${node.inputs.join(' | ')}`);
    }

    if (node.outputs?.length) {
      lines.push(`${indent}  输出：${node.outputs.join(' | ')}`);
    }

    if (node.dependencies?.length) {
      lines.push(`${indent}  依赖：${node.dependencies.join(' | ')}`);
    }

    if (node.acceptanceCriteria?.length) {
      lines.push(`${indent}  验收：${node.acceptanceCriteria.join(' | ')}`);
    }

    node.children.forEach((child) => {
      lines.push(renderNode(child, depth + 1));
    });

    return lines.join('\n');
  };

  return ['# 功能清单', '', ...tree.children.map((node) => renderNode(node, 0))].join('\n');
};

export const markdownToFeatureTree = (markdown: string, treeName = '功能清单'): FeatureTree => {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const root: FeatureTree = { id: createId(), name: treeName, children: [] };
  const nodeStack: FeatureNode[] = [];
  const indentStack: number[] = [];

  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();

    if (!trimmed || trimmed === '# 功能清单') {
      return;
    }

    const nodeMatch = line.match(/^(\s*)-\s+(.+)$/);
    if (nodeMatch) {
      const indent = nodeMatch[1].length;
      const name = nodeMatch[2].trim().replace(/^功能[:：]\s*/, '');
      const nextNode = createFeatureNode(name);

      while (indentStack.length > 0 && indent <= indentStack[indentStack.length - 1]) {
        indentStack.pop();
        nodeStack.pop();
      }

      if (nodeStack.length === 0) {
        root.children.push(nextNode);
      } else {
        nodeStack[nodeStack.length - 1].children.push(nextNode);
      }

      nodeStack.push(nextNode);
      indentStack.push(indent);
      return;
    }

    if (nodeStack.length === 0) {
      return;
    }

    const currentNode = nodeStack[nodeStack.length - 1];
    const descriptionMatch = trimmed.match(/^描述[:：]\s*(.+)$/);
    if (descriptionMatch) {
      currentNode.description = descriptionMatch[1].trim();
      return;
    }

    const detailsMatch = trimmed.match(/^说明[:：]\s*(.+)$/);
    if (detailsMatch) {
      currentNode.details = splitPipeValue(detailsMatch[1]);
      return;
    }

    const inputsMatch = trimmed.match(/^输入[:：]\s*(.+)$/);
    if (inputsMatch) {
      currentNode.inputs = splitPipeValue(inputsMatch[1]);
      return;
    }

    const outputsMatch = trimmed.match(/^输出[:：]\s*(.+)$/);
    if (outputsMatch) {
      currentNode.outputs = splitPipeValue(outputsMatch[1]);
      return;
    }

    const dependenciesMatch = trimmed.match(/^依赖[:：]\s*(.+)$/);
    if (dependenciesMatch) {
      currentNode.dependencies = splitPipeValue(dependenciesMatch[1]);
      return;
    }

    const acceptanceMatch = trimmed.match(/^验收[:：]\s*(.+)$/);
    if (acceptanceMatch) {
      currentNode.acceptanceCriteria = splitPipeValue(acceptanceMatch[1]);
    }
  });

  return root;
};

export const parseFeatureMarkdown = (markdown: string, tree: FeatureTree): Map<string, string> => {
  const parsedTree = markdownToFeatureTree(markdown, tree.name);
  const existingIds = collectNodeIds(tree.children);
  const parsedIds = collectNodeIds(parsedTree.children);
  const featureMap = new Map<string, string>();

  parsedIds.forEach((id, index) => {
    const existingId = existingIds[index];
    if (existingId) {
      featureMap.set(id, existingId);
    }
  });

  return featureMap;
};

export const findNodeById = (tree: FeatureTree, id: string): FeatureNode | null => {
  const search = (nodes: FeatureNode[]): FeatureNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = search(node.children);
      if (found) return found;
    }
    return null;
  };

  return search(tree.children);
};
