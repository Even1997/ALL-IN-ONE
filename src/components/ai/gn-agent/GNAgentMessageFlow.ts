export type GNAgentMessageFlowSectionKind = 'thinking' | 'bubble' | 'cards';

export type GNAgentMessageFlowItem = {
  kind: GNAgentMessageFlowSectionKind;
  key: string;
  createdAt?: number;
};

export type GNAgentMessageFlowSection = {
  kind: GNAgentMessageFlowSectionKind;
  keys: string[];
};

export const buildGNAgentMessageFlow = (items: GNAgentMessageFlowItem[]): GNAgentMessageFlowSection[] => {
  const sections: GNAgentMessageFlowSection[] = [];
  const orderedItems = items
    .map((item, index) => ({ ...item, index }))
    .sort((left, right) => {
      const leftTime = typeof left.createdAt === 'number' ? left.createdAt : Number.MAX_SAFE_INTEGER;
      const rightTime = typeof right.createdAt === 'number' ? right.createdAt : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || left.index - right.index;
    });

  for (const item of orderedItems) {
    const lastSection = sections[sections.length - 1];
    if (lastSection?.kind === item.kind) {
      lastSection.keys.push(item.key);
    } else {
      sections.push({ kind: item.kind, keys: [item.key] });
    }
  }

  return sections;
};
