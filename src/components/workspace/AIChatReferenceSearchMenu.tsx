import React from 'react';

type ReferenceSearchEntry = {
  id: string;
  title: string;
  path: string;
};

export type AIChatReferenceSearchMenuProps = {
  entries: ReferenceSearchEntry[];
  selectedIndex: number;
  onHover: (index: number) => void;
  onSelect: (file: ReferenceSearchEntry) => void;
};

const shortenPath = (value: string) => {
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length <= 3) {
    return normalized;
  }

  return `.../${parts.slice(-3).join('/')}`;
};

export const AIChatReferenceSearchMenu: React.FC<AIChatReferenceSearchMenuProps> = ({
  entries,
  selectedIndex,
  onHover,
  onSelect,
}) => {
  if (entries.length === 0) {
    return (
      <div className="chat-reference-search-menu">
        <div className="chat-reference-search-empty">No matching files</div>
      </div>
    );
  }

  return (
    <div className="chat-reference-search-menu" role="listbox" aria-label="Reference file search">
      {entries.map((entry, index) => (
        <button
          key={entry.id}
          type="button"
          className={`chat-reference-search-item ${selectedIndex === index ? 'active' : ''}`}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(entry)}
        >
          <strong>{entry.title}</strong>
          <span title={entry.path}>{shortenPath(entry.path)}</span>
        </button>
      ))}
    </div>
  );
};
