import FlexSearch from 'flexsearch';

type SearchableKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  summary?: string;
};

export const buildKnowledgeSearchIndex = (entries: SearchableKnowledgeEntry[]) => {
  const index = new FlexSearch.Document({
    document: {
      id: 'id',
      index: ['title', 'content', 'summary'],
      store: ['id'],
    },
    tokenize: 'forward',
  });

  entries.forEach((entry) => index.add(entry));

  return {
    index,
    entries,
  };
};

export const searchKnowledgeEntries = (
  state: ReturnType<typeof buildKnowledgeSearchIndex>,
  query: string
) => {
  const keyword = query.trim();
  if (!keyword) {
    return state.entries;
  }

  const normalizedKeyword = keyword.toLowerCase();
  const ids = new Set(
    state.index
      .search(keyword, { enrich: true })
      .flatMap((group) => group.result.map((item) => item.id as string))
  );

  return state.entries.filter((entry) => {
    if (ids.has(entry.id)) {
      return true;
    }

    return [entry.title, entry.content, entry.summary || '']
      .join('\n')
      .toLowerCase()
      .includes(normalizedKeyword);
  });
};
