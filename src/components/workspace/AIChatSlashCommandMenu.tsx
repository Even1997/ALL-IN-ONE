import React from 'react';

export type SlashCommandEntry = {
  id: string;
  name: string;
  description: string;
};

export const AIChatSlashCommandMenu: React.FC<{
  entries: SlashCommandEntry[];
  selectedIndex: number;
  onHover: (index: number) => void;
  onSelect: (entry: SlashCommandEntry) => void;
}> = ({ entries, selectedIndex, onHover, onSelect }) => {
  if (entries.length === 0) {
    return (
      <div className="chat-reference-search-menu">
        <div className="chat-reference-search-empty">No matching slash commands</div>
      </div>
    );
  }

  return (
    <div className="chat-reference-search-menu" role="listbox" aria-label="Slash commands">
      {entries.map((entry, index) => (
        <button
          key={entry.id}
          type="button"
          className={`chat-reference-search-item ${selectedIndex === index ? 'active' : ''}`}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(entry)}
        >
          <strong>/{entry.name}</strong>
          <span>{entry.description}</span>
        </button>
      ))}
    </div>
  );
};
