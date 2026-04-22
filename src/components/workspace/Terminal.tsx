import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Terminal.css';

interface TerminalLine {
  id: string;
  type: 'command' | 'output' | 'error' | 'success';
  content: string;
  timestamp: Date;
}

interface TerminalProps {
  recommendedCommands?: string[];
}

export const Terminal: React.FC<TerminalProps> = ({ recommendedCommands = [] }) => {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 'welcome',
      type: 'output',
      content:
        'DevFlow Terminal v1.0.0\nType "help" for available commands.\n' +
        (recommendedCommands.length > 0
          ? `\nSuggested:\n${recommendedCommands.map((command) => `  ${command}`).join('\n')}\n`
          : ''),
      timestamp: new Date(),
    },
  ]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [cwd, setCwd] = useState('~/Documents/all-in-one');
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [lines]);

  const executeCommand = useCallback(async (cmd: string) => {
    const trimmedCmd = cmd.trim();
    if (!trimmedCmd) return;

    // Add to history
    setCommandHistory(prev => [...prev, trimmedCmd]);
    setHistoryIndex(-1);

    // Add command line
    const commandLine: TerminalLine = {
      id: `cmd_${Date.now()}`,
      type: 'command',
      content: `${cwd}$ ${trimmedCmd}`,
      timestamp: new Date(),
    };

    setLines(prev => [...prev, commandLine]);

    // Parse and execute command
    const [command, ...args] = trimmedCmd.split(' ');
    const output = await processCommand(command.toLowerCase(), args);

    // Add output
    if (output) {
      const outputLine: TerminalLine = {
        id: `output_${Date.now()}`,
        type: output.type,
        content: output.content,
        timestamp: new Date(),
      };
      setLines(prev => [...prev, outputLine]);
    }

    setCurrentCommand('');
  }, [cwd, recommendedCommands]);

  const processCommand = async (
    cmd: string,
    args: string[]
  ): Promise<{ type: 'output' | 'error' | 'success'; content: string } | null> => {
    switch (cmd) {
      case 'help':
        return {
          type: 'output',
          content: `Available commands:
  help     - Show this help message
  clear    - Clear terminal
  pwd      - Print working directory
  cd       - Change directory
  ls       - List directory contents
  cat      - Display file contents
  npm      - Run npm commands
  git      - Git commands
  node     - Run Node.js
  echo     - Print text

Tips:
  • Use ↑/↓ arrows for command history
  • Tab for auto-completion (coming soon)
${recommendedCommands.length > 0 ? `\nSuggested commands:\n${recommendedCommands.map((command) => `  ${command}`).join('\n')}` : ''}`,
        };

      case 'clear':
        setLines([]);
        return null;

      case 'pwd':
        return { type: 'output', content: cwd };

      case 'cd':
        const newDir = args[0] || '~';
        if (newDir === '~') {
          setCwd('~/Documents/all-in-one');
        } else if (newDir === '..') {
          setCwd(prev => prev.split('/').slice(0, -1).join('/') || '~');
        } else if (newDir.startsWith('/')) {
          setCwd(newDir);
        } else {
          setCwd(`${cwd}/${newDir}`);
        }
        return null;

      case 'echo':
        return { type: 'output', content: args.join(' ') };

      default:
        try {
          const fullCommand = `cd "${cwd.replace(/^~\//, '/Users/apple/')}" && ${[cmd, ...args].join(' ')}`;
          const result = await invoke<{ success: boolean; content: string; error: string | null }>('tool_bash', {
            params: {
              command: fullCommand,
              timeout: 120000,
            },
          });

          return {
            type: result.success ? 'success' : 'error',
            content: [result.content, result.error].filter(Boolean).join('\n'),
          };
        } catch (error) {
          return {
            type: 'error',
            content: `${cmd}: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(currentCommand);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentCommand('');
      }
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div className="terminal" onClick={handleContainerClick}>
      {/* Terminal Header */}
      <div className="terminal-header">
        <div className="terminal-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <span className="terminal-title">{cwd}</span>
        <div className="terminal-actions">
          <button className="terminal-action" onClick={() => setLines([])} title="Clear">🗑️</button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="terminal-output" ref={outputRef}>
        {lines.map(line => (
          <div key={line.id} className={`terminal-line ${line.type}`}>
            <pre>{line.content}</pre>
          </div>
        ))}
      </div>

      {/* Terminal Input */}
      <div className="terminal-input-line">
        <span className="terminal-prompt">{cwd}$</span>
        <input
          ref={inputRef}
          type="text"
          value={currentCommand}
          onChange={(e) => setCurrentCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          className="terminal-input"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
};
