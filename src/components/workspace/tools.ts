// OpenCode-style Tools for Web - TypeScript Implementation
// Based on OpenCode's tool definitions

import { invoke } from '@tauri-apps/api/core';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  required: string[];
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  items?: ToolParameter;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  type: 'text' | 'image';
  content: string;
  is_error?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RustToolResult {
  success: boolean;
  content: string;
  error: string | null;
}

// Tool Definitions based on OpenCode
export const TOOLS: Tool[] = [
  {
    name: 'glob',
    description: `Fast file pattern matching tool that finds files by name and pattern, returning matching paths sorted by modification time (newest first).

WHEN TO USE THIS TOOL:
- Use when you need to find files by name patterns or extensions
- Great for finding specific file types across a directory structure
- Useful for discovering files that match certain naming conventions

GLOB PATTERN SYNTAX:
- '*' matches any sequence of non-separator characters
- '**' matches any sequence of characters, including separators
- '?' matches any single non-separator character
- '[...]' matches any character in the brackets

COMMON PATTERN EXAMPLES:
- '*.js' - Find all JavaScript files
- '**/*.ts' - Find all TypeScript files recursively
- 'src/**/*.{ts,tsx}' - Find TypeScript files in src directory`,
    parameters: {
      pattern: { type: 'string', description: 'The glob pattern to match files against' },
      path: { type: 'string', description: 'The directory to search in (defaults to project root)' },
    },
    required: ['pattern'],
  },
  {
    name: 'grep',
    description: `Fast content search tool that finds files containing specific text or patterns.

WHEN TO USE THIS TOOL:
- Use when you need to find files containing specific text
- Great for searching code for function names, variable declarations
- Results are sorted by modification time (newest first)

PARAMETERS:
- pattern: regex pattern to search for
- path: directory to search in
- include: file pattern filter (e.g. "*.js")
- literal_text: treat pattern as literal text (not regex)`,
    parameters: {
      pattern: { type: 'string', description: 'The regex pattern to search for in file contents' },
      path: { type: 'string', description: 'The directory to search in' },
      include: { type: 'string', description: 'File pattern to include (e.g. "*.ts")' },
      literal_text: { type: 'boolean', description: 'If true, treat pattern as literal text' },
    },
    required: ['pattern'],
  },
  {
    name: 'ls',
    description: `Directory listing tool that shows files and subdirectories in a tree structure.

WHEN TO USE THIS TOOL:
- Use when you need to explore directory structure
- Helpful for understanding project organization

PARAMETERS:
- path: directory path to list (defaults to project root)
- ignore: array of glob patterns to skip`,
    parameters: {
      path: { type: 'string', description: 'The path to the directory to list' },
      ignore: { type: 'array', description: 'List of glob patterns to ignore', items: { type: 'string', description: 'Glob pattern' } },
    },
    required: ['path'],
  },
  {
    name: 'view',
    description: `File viewing tool that reads and displays the contents of files with line numbers.

WHEN TO USE THIS TOOL:
- Use when you need to read the contents of a specific file
- Helpful for examining source code or configuration files

PARAMETERS:
- file_path: path to the file to read
- offset: line number to start reading from (0-based)
- limit: number of lines to read (default 2000)

LIMITATIONS:
- Maximum file size is 250KB
- Default reading limit is 2000 lines`,
    parameters: {
      file_path: { type: 'string', description: 'The path to the file to read' },
      offset: { type: 'number', description: 'The line number to start reading from (0-based)' },
      limit: { type: 'number', description: 'The number of lines to read' },
    },
    required: ['file_path'],
  },
  {
    name: 'write',
    description: `File writing tool that creates or updates files.

WHEN TO USE THIS TOOL:
- Use when you need to create a new file
- Use when you need to update an existing file

PARAMETERS:
- file_path: path to the file to write
- content: the content to write

NOTE: Will create parent directories if they don't exist.`,
    parameters: {
      file_path: { type: 'string', description: 'The path to the file to write' },
      content: { type: 'string', description: 'The content to write to the file' },
    },
    required: ['file_path', 'content'],
  },
  {
    name: 'edit',
    description: `File editing tool for making targeted changes to specific parts of a file.

WHEN TO USE THIS TOOL:
- Use when you need to make small, targeted changes
- Specify the exact location and new content

PARAMETERS:
- file_path: path to the file to edit
- old_string: the exact string to replace
- new_string: the replacement string`,
    parameters: {
      file_path: { type: 'string', description: 'The path to the file to edit' },
      old_string: { type: 'string', description: 'The exact string to replace' },
      new_string: { type: 'string', description: 'The replacement string' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  {
    name: 'bash',
    description: `Execute shell commands in a persistent session.

WHEN TO USE THIS TOOL:
- Use when you need to run terminal commands
- Commands share the same shell session

PARAMETERS:
- command: the shell command to execute
- timeout: timeout in milliseconds (max 600000)

TIPS:
- Try to use absolute paths
- Avoid 'cd' commands to maintain context`,
    parameters: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in milliseconds' },
    },
    required: ['command'],
  },
  {
    name: 'fetch',
    description: `Fetch data from URLs.

WHEN TO USE THIS TOOL:
- Use when you need to fetch web content
- Returns the content of the URL

PARAMETERS:
- url: the URL to fetch
- format: 'text' or 'json'`,
    parameters: {
      url: { type: 'string', description: 'The URL to fetch' },
      format: { type: 'string', description: 'Response format: text or json' },
    },
    required: ['url', 'format'],
  },
];

// Tool Executor - executes tools via Tauri commands
export class ToolExecutor {
  private projectRoot: string;

  constructor(projectRoot: string = '/Users/apple/Documents/all-in-one/src') {
    this.projectRoot = projectRoot;
  }

  setProjectRoot(root: string) {
    this.projectRoot = root;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const { name, input } = call;

    try {
      switch (name) {
        case 'glob':
          return await this.glob(input as unknown as GlobParams);
        case 'grep':
          return await this.grep(input as unknown as GrepParams);
        case 'ls':
          return await this.ls(input as unknown as LSParams);
        case 'view':
          return await this.view(input as unknown as ViewParams);
        case 'write':
          return await this.write(input as unknown as WriteParams);
        case 'edit':
          return await this.edit(input as unknown as EditParams);
        case 'bash':
          return await this.bash(input as unknown as BashParams);
        case 'fetch':
          return await this.fetchUrl(input as unknown as FetchParams);
        default:
          return { type: 'text', content: `Unknown tool: ${name}`, is_error: true };
      }
    } catch (error) {
      return {
        type: 'text',
        content: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
        is_error: true,
      };
    }
  }

  private async glob(params: GlobParams): Promise<ToolResult> {
    try {
      const result = await invoke<RustToolResult>('tool_glob', {
        params: {
          pattern: params.pattern,
          path: params.path || this.projectRoot,
        },
      });

      return {
        type: 'text',
        content: result.content,
        is_error: !result.success,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `Glob error: ${e}`,
        is_error: true,
      };
    }
  }

  private async grep(params: GrepParams): Promise<ToolResult> {
    try {
      const result = await invoke<RustToolResult>('tool_grep', {
        params: {
          pattern: params.pattern,
          path: params.path || this.projectRoot,
          include: params.include,
        },
      });

      return {
        type: 'text',
        content: result.content,
        is_error: !result.success,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `Grep error: ${e}`,
        is_error: true,
      };
    }
  }

  private async ls(params: LSParams): Promise<ToolResult> {
    try {
      const result = await invoke<RustToolResult>('tool_ls', {
        params: {
          path: params.path || this.projectRoot,
        },
      });

      return {
        type: 'text',
        content: result.content,
        is_error: !result.success,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `LS error: ${e}`,
        is_error: true,
      };
    }
  }

  private async view(params: ViewParams): Promise<ToolResult> {
    try {
      const result = await invoke<RustToolResult>('tool_view', {
        params: {
          file_path: params.file_path,
          offset: params.offset || 0,
          limit: params.limit || 2000,
        },
      });

      return {
        type: 'text',
        content: result.content,
        is_error: !result.success,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `View error: ${e}`,
        is_error: true,
      };
    }
  }

  private async write(params: WriteParams): Promise<ToolResult> {
    try {
      const result = await invoke<RustToolResult>('tool_write', {
        params: {
          file_path: params.file_path,
          content: params.content,
        },
      });

      return {
        type: 'text',
        content: result.content,
        is_error: !result.success,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `Write error: ${e}`,
        is_error: true,
      };
    }
  }

  private async edit(params: EditParams): Promise<ToolResult> {
    try {
      const result = await invoke<RustToolResult>('tool_edit', {
        params: {
          file_path: params.file_path,
          old_string: params.old_string,
          new_string: params.new_string,
        },
      });

      return {
        type: 'text',
        content: result.content,
        is_error: !result.success,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `Edit error: ${e}`,
        is_error: true,
      };
    }
  }

  private async bash(params: BashParams): Promise<ToolResult> {
    try {
      const result = await invoke<RustToolResult>('tool_bash', {
        params: {
          command: params.command,
          timeout: params.timeout || 60000,
        },
      });

      return {
        type: 'text',
        content: result.content + (result.error ? `\nError: ${result.error}` : ''),
        is_error: !result.success,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `Bash error: ${e}`,
        is_error: true,
      };
    }
  }

  private async fetchUrl(params: FetchParams): Promise<ToolResult> {
    try {
      const response = await fetch(params.url);
      const text = await response.text();
      return {
        type: 'text',
        content: `Fetched from ${params.url}:\n\n${text.substring(0, 5000)}${text.length > 5000 ? '\n...(truncated)' : ''}`,
      };
    } catch (error) {
      return {
        type: 'text',
        content: `Failed to fetch ${params.url}: ${error instanceof Error ? error.message : String(error)}`,
        is_error: true,
      };
    }
  }
}

// Tool call parser - extracts tool calls from LLM responses
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /<tool_use>\s*<tool name="(\w+)">(.*?)<\/tool>/gs;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const paramsMatch = match[2].match(/<tool_params>(.*?)<\/tool_params>/s);
    if (paramsMatch) {
      try {
        const input = JSON.parse(paramsMatch[1]);
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          input,
        });
      } catch {
        // Skip malformed params
      }
    }
  }

  return calls;
}

// Format tool call for LLM
export function formatToolCall(call: ToolCall): string {
  return `<tool_use>
<tool name="${call.name}">
<tool_params>${JSON.stringify(call.input)}</tool_params>
</tool>
</tool_use>`;
}

// Format tool result for LLM
export function formatToolResult(result: ToolResult): string {
  const isError = result.is_error ? 'error' : 'success';
  return `<tool_result name="${result.type}" ${isError}>
${result.content}
</tool_result>`;
}

// Type definitions
interface GlobParams {
  pattern: string;
  path?: string;
}

interface GrepParams {
  pattern: string;
  path?: string;
  include?: string;
  literal_text?: boolean;
}

interface LSParams {
  path?: string;
  ignore?: string[];
}

interface ViewParams {
  file_path: string;
  offset?: number;
  limit?: number;
}

interface WriteParams {
  file_path: string;
  content: string;
}

interface EditParams {
  file_path: string;
  old_string: string;
  new_string: string;
}

interface BashParams {
  command: string;
  timeout?: number;
}

interface FetchParams {
  url: string;
  format: 'text' | 'json';
}