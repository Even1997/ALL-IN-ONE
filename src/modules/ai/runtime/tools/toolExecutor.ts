// OpenCode-style Tools for Web - TypeScript Implementation
// Based on OpenCode's tool definitions

import { invoke } from '@tauri-apps/api/core';
import { readProjectTextFile } from '../../../../utils/projectPersistence.ts';
import { isWindowsHost } from '../../../../utils/hostPlatform.ts';

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

export interface ToolResultFileChange {
  path: string;
  beforeContent: string | null;
  afterContent: string | null;
  operation?: 'write' | 'edit' | 'delete';
  verified?: boolean;
}

export interface RustToolResult {
  success: boolean;
  content: string;
  error: string | null;
}

export const resolveRustToolResultText = (result: RustToolResult) =>
  result.success ? result.content : result.error || result.content || 'Tool execution failed.';

const resolveToolFilePathParam = (params: Record<string, unknown>) => {
  const candidate = params.file_path ?? params.filePath ?? params.path ?? params.target ?? params.file;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
};

export const resolveViewFilePathParam = (params: Record<string, unknown>) =>
  resolveToolFilePathParam(params);

export const resolveWriteFilePathParam = (params: Record<string, unknown>) =>
  resolveToolFilePathParam(params);

export const resolveEditStrings = (params: Record<string, unknown>) => {
  const oldCandidate = params.old_string ?? params.oldString ?? params.pattern;
  const newCandidate = params.new_string ?? params.newString ?? params.replace ?? params.replacement;

  if (typeof oldCandidate !== 'string' || typeof newCandidate !== 'string') {
    return null;
  }

  return {
    oldString: oldCandidate,
    newString: newCandidate,
  };
};

const SLOW_SNAPSHOT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.rst']);
const FILE_CHANGE_SNAPSHOT_CHAR_LIMIT = 12_000;

const getLowercaseFileExtension = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || normalized;
  const extensionIndex = fileName.lastIndexOf('.');
  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : '';
};

export const shouldCaptureFileChangeSnapshot = (filePath: string, contentLength?: number) => {
  if (SLOW_SNAPSHOT_EXTENSIONS.has(getLowercaseFileExtension(filePath))) {
    return false;
  }

  if (typeof contentLength === 'number' && contentLength > FILE_CHANGE_SNAPSHOT_CHAR_LIMIT) {
    return false;
  }

  return true;
};

export const buildVerifiedFileChange = (input: {
  path: string;
  operation: NonNullable<ToolResultFileChange['operation']>;
  beforeContent: string | null;
  afterContent: string | null;
}): ToolResultFileChange => ({
  path: input.path,
  operation: input.operation,
  beforeContent: input.beforeContent,
  afterContent: input.afterContent,
  verified: true,
});

export const verifyWriteFileMutation = async (input: {
  filePath: string;
  expectedContent: string;
  readTextFile: (filePath: string) => Promise<string | null>;
}) => {
  const persistedContent = await input.readTextFile(input.filePath);
  return persistedContent === input.expectedContent;
};

export const verifyEditFileMutation = async (input: {
  filePath: string;
  beforeContent: string | null;
  newString: string;
  readTextFile: (filePath: string) => Promise<string | null>;
}) => {
  const persistedContent = await input.readTextFile(input.filePath);
  if (persistedContent === null) {
    return false;
  }

  if (input.beforeContent !== null && persistedContent === input.beforeContent) {
    return false;
  }

  return input.newString.length === 0 || persistedContent.includes(input.newString);
};

const TOOL_PROTOCOL_MARKER_PATTERN =
  /<tool_use>|<\/tool_use>|<tool_result|<\/tool_result>|<apply_skill\b|<\s*\|\s*DSML\b|tool_calls>|"tool_calls"\s*:/i;

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
- Prefer this over shell commands such as dir, ls, or Get-ChildItem when you are only listing files

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
- Prefer this over shell commands such as cat, type, or Get-Content when you only need file contents

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
    description: `File writing tool that creates or overwrites files.

WHEN TO USE THIS TOOL:
- Use only when the user asked to create, save, or fully rewrite a concrete file.
- For existing files, read the file first with view before writing.
- Prefer edit for targeted changes.
- Never create documentation files (*.md) or README files unless explicitly requested by the user.
- Do not use this tool to answer questions about saving problems; answer those normally unless a concrete file write is needed.

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
- Use only after you have enough exact context to provide old_string.
- Prefer view first when editing an existing file.
- Do not use this tool merely because the user mentioned "save" or "保存" in a question.

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
  ...(isWindowsHost()
    ? [
        {
          name: 'powershell',
          description: `Execute PowerShell commands in a persistent session.

WHEN TO USE THIS TOOL:
- Use when you need to run terminal commands on Windows with PowerShell syntax
- Commands share the same shell session
- Do not use this for directory listing, file search, or file reading when ls, glob, grep, or view can handle the task

PARAMETERS:
- command: the PowerShell command to execute
- timeout: timeout in milliseconds (max 600000)

TIPS:
- Try to use absolute paths
- Avoid 'cd' commands to maintain context
- Use PowerShell syntax such as Get-Location, Get-ChildItem, and $env:NAME`,
          parameters: {
            command: { type: 'string', description: 'The PowerShell command to execute' },
            timeout: { type: 'number', description: 'Timeout in milliseconds' },
          },
          required: ['command'],
        } satisfies Tool,
      ]
    : [
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
- Avoid 'cd' commands to maintain context
- On Windows, use PowerShell-compatible syntax by default`,
          parameters: {
            command: { type: 'string', description: 'The shell command to execute' },
            timeout: { type: 'number', description: 'Timeout in milliseconds' },
          },
          required: ['command'],
        } satisfies Tool,
      ]),
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
  {
    name: 'agent',
    description: `Delegate a task to the built-in multi-agent runtime.

WHEN TO USE THIS TOOL:
- Use when the task benefits from staged multi-agent analysis and implementation
- Best for larger refactors, workflow changes, or requests that need product, implementation, and QA perspectives
- The runtime will coordinate the existing multi-agent team and return an integrated result

PARAMETERS:
- prompt: the delegated task request
- preferred_agent: optional execution preference, either 'codex' or 'claude'

ALIASES:
- prompt may also appear as task or request
- preferred_agent may also appear as preferredAgent or agent`,
    parameters: {
      prompt: { type: 'string', description: 'The task to delegate to the multi-agent runtime' },
      preferred_agent: {
        type: 'string',
        description: "Optional preferred execution agent: 'codex' or 'claude'",
      },
    },
    required: ['prompt'],
  },
  {
    name: 'AskUserQuestion',
    description: `Pause execution and ask the user a direct question when the next step depends on a user decision that cannot be inferred safely.

PARAMETERS:
- question: single question string
- options: optional list of answer choices with labels/descriptions
- or questions: an array of question objects with the same shape`,
    parameters: {
      question: { type: 'string', description: 'A single question for the user' },
      options: {
        type: 'array',
        description: 'Optional answer choices',
        items: { type: 'object', description: 'Choice object with label and optional description' },
      },
      questions: {
        type: 'array',
        description: 'Optional multi-question payload',
        items: { type: 'object', description: 'Question object' },
      },
    },
    required: [],
  },
];

// Tool Executor - executes tools via Tauri commands
export class ToolExecutor {
  private projectRoot: string;

  constructor(projectRoot: string = '.') {
    this.projectRoot = projectRoot;
  }

  setProjectRoot(root: string) {
    this.projectRoot = root;
  }

  private normalizePath(value: string) {
    return value.replace(/\\/g, '/');
  }

  private normalizeProjectRoot() {
    return this.normalizePath(this.projectRoot).replace(/\/+$/, '');
  }

  private isAbsolutePath(value: string) {
    return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value);
  }

  private ensureProjectPath(pathValue?: string, kind: 'file' | 'directory' = 'file') {
    const normalizedRoot = this.normalizeProjectRoot();
    if (!normalizedRoot) {
      throw new Error('Current project root is unavailable.');
    }

    const rawPath = (pathValue || this.projectRoot).trim();
    const candidatePath = rawPath || this.projectRoot;
    const normalizedCandidate = this.normalizePath(candidatePath);
    const resolvedPath = this.isAbsolutePath(candidatePath)
      ? normalizedCandidate
      : `${normalizedRoot}/${normalizedCandidate.replace(/^\/+/, '')}`.replace(/\/+/g, '/');
    const comparableResolved = resolvedPath.toLowerCase();
    const comparableRoot = normalizedRoot.toLowerCase();

    if (
      comparableResolved !== comparableRoot &&
      !comparableResolved.startsWith(`${comparableRoot}/`)
    ) {
      throw new Error(
        `Cannot access ${kind} outside the current project. Stay under ${this.projectRoot}.`
      );
    }

    return resolvedPath;
  }

  private toProjectRelativePath(filePath: string) {
    const normalizedPath = this.normalizePath(filePath);
    const normalizedRoot = this.normalizePath(this.projectRoot).replace(/\/+$/, '');

    if (!normalizedRoot || !normalizedPath.startsWith(normalizedRoot)) {
      return normalizedPath;
    }

    return normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '') || normalizedPath;
  }

  private async readTextFileSnapshot(filePath: string) {
    try {
      return await readProjectTextFile(filePath);
    } catch {
      return null;
    }
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
        case 'powershell':
          return await this.bash(
            {
              ...(input as unknown as BashParams),
              shell: 'powershell',
            },
            'PowerShell'
          );
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
      const searchPath = this.ensureProjectPath(params.path, 'directory');
      const result = await invoke<RustToolResult>('tool_glob', {
        params: {
          pattern: params.pattern,
          path: searchPath,
        },
      });

      return {
        type: 'text',
        content: resolveRustToolResultText(result),
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
      const searchPath = this.ensureProjectPath(params.path, 'directory');
      const result = await invoke<RustToolResult>('tool_grep', {
        params: {
          pattern: params.pattern,
          path: searchPath,
          include: params.include,
        },
      });

      return {
        type: 'text',
        content: resolveRustToolResultText(result),
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
      const searchPath = this.ensureProjectPath(params.path, 'directory');
      const result = await invoke<RustToolResult>('tool_ls', {
        params: {
          path: searchPath,
        },
      });

      return {
        type: 'text',
        content: resolveRustToolResultText(result),
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
      const requestedFilePath = resolveViewFilePathParam(params as unknown as Record<string, unknown>);
      if (!requestedFilePath) {
        throw new Error('view requires a file_path parameter.');
      }
      const filePath = this.ensureProjectPath(requestedFilePath, 'file');
      const result = await invoke<RustToolResult>('tool_view', {
        params: {
          project_root: this.projectRoot,
          file_path: filePath,
          offset: params.offset || 0,
          limit: params.limit || 2000,
        },
      });

      return {
        type: 'text',
        content: resolveRustToolResultText(result),
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
      const requestedFilePath = resolveWriteFilePathParam(params as unknown as Record<string, unknown>);
      if (!requestedFilePath) {
        throw new Error('write requires a file_path parameter.');
      }
      const filePath = this.ensureProjectPath(requestedFilePath, 'file');
      const content = String(params.content ?? '');
      const captureSnapshot = shouldCaptureFileChangeSnapshot(filePath, content.length);
      const beforeContent = captureSnapshot ? await this.readTextFileSnapshot(filePath) : null;
      const result = await invoke<RustToolResult>('tool_write', {
        params: {
          project_root: this.projectRoot,
          file_path: filePath,
          content,
        },
      });
      const verified =
        result.success &&
        (await verifyWriteFileMutation({
          filePath,
          expectedContent: content,
          readTextFile: (path) => this.readTextFileSnapshot(path),
        }));

      return {
        type: 'text',
        content: verified
          ? resolveRustToolResultText(result)
          : result.success
            ? `Write verification failed: ${filePath}`
            : resolveRustToolResultText(result),
        is_error: !verified,
        metadata: verified
          ? {
              fileChanges: [
                buildVerifiedFileChange({
                  path: this.toProjectRelativePath(filePath),
                  operation: 'write',
                  beforeContent,
                  afterContent: captureSnapshot ? content : null,
                }),
              ],
            }
          : undefined,
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
      const requestedFilePath = resolveToolFilePathParam(params as unknown as Record<string, unknown>);
      if (!requestedFilePath) {
        throw new Error('edit requires a file_path parameter.');
      }
      const editStrings = resolveEditStrings(params as unknown as Record<string, unknown>);
      if (!editStrings) {
        throw new Error('edit requires old_string and new_string parameters.');
      }
      const filePath = this.ensureProjectPath(requestedFilePath, 'file');
      const captureSnapshot = shouldCaptureFileChangeSnapshot(
        filePath,
        editStrings.oldString.length + editStrings.newString.length
      );
      const beforeContent = captureSnapshot ? await this.readTextFileSnapshot(filePath) : null;
      const result = await invoke<RustToolResult>('tool_edit', {
        params: {
          project_root: this.projectRoot,
          file_path: filePath,
          old_string: editStrings.oldString,
          new_string: editStrings.newString,
        },
      });

      const afterContent = result.success && captureSnapshot
        ? await this.readTextFileSnapshot(filePath)
        : null;
      const verified =
        result.success &&
        (await verifyEditFileMutation({
          filePath,
          beforeContent,
          newString: editStrings.newString,
          readTextFile: (path) => this.readTextFileSnapshot(path),
        }));

      return {
        type: 'text',
        content: verified
          ? resolveRustToolResultText(result)
          : result.success
            ? `Edit verification failed: ${filePath}`
            : resolveRustToolResultText(result),
        is_error: !verified,
        metadata: verified
          ? {
              fileChanges: [
                buildVerifiedFileChange({
                  path: this.toProjectRelativePath(filePath),
                  operation: 'edit',
                  beforeContent,
                  afterContent,
                }),
              ],
            }
          : undefined,
      };
    } catch (e) {
      return {
        type: 'text',
        content: `Edit error: ${e}`,
        is_error: true,
      };
    }
  }

  private async bash(params: BashParams, toolLabel = 'Bash'): Promise<ToolResult> {
    try {
      const cwd = this.ensureProjectPath(params.cwd, 'directory');
      const result = await invoke<RustToolResult>('tool_bash', {
        params: {
          project_root: this.projectRoot,
          command: params.command,
          timeout: params.timeout || 60000,
          cwd,
          shell: params.shell,
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
        content: `${toolLabel} error: ${e}`,
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

const normalizeParsedToolInput = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const normalizeParsedToolName = (value: string) => {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === 'read' ? 'view' : trimmed;
};

const createParsedToolCall = (name: string, input: Record<string, unknown>): ToolCall => ({
  id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  name: normalizeParsedToolName(name),
  input,
});

const parseToolArguments = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    try {
      return parseToolArguments(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return normalizeParsedToolInput(value);
};

const parseJsonFunctionToolCall = (value: unknown): ToolCall | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const functionValue = record.function;
  if (!functionValue || typeof functionValue !== 'object' || Array.isArray(functionValue)) {
    return null;
  }

  const functionRecord = functionValue as Record<string, unknown>;
  const name = typeof functionRecord.name === 'string' ? functionRecord.name.trim() : '';
  if (!name) {
    return null;
  }

  const input = parseToolArguments(functionRecord.arguments);
  if (!input) {
    return null;
  }

  return createParsedToolCall(name, input);
};

const parseToolCallsFromJsonValue = (value: unknown): ToolCall[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseToolCallsFromJsonValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.tool_calls)) {
    return record.tool_calls.flatMap((entry) => {
      const parsed = parseJsonFunctionToolCall(entry);
      return parsed ? [parsed] : [];
    });
  }

  const parsed = parseJsonFunctionToolCall(record);
  return parsed ? [parsed] : [];
};

const extractBalancedJsonSegment = (text: string, startIndex: number): string | null => {
  const opening = text[startIndex];
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : '';
  if (!closing) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (character === '\\') {
        escaping = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === opening) {
      depth += 1;
      continue;
    }

    if (character === closing) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const collectJsonProtocolCandidates = (text: string): string[] => {
  const candidates = new Set<string>();
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.add(trimmed);
  }

  const fencedBlockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fencedMatch: RegExpExecArray | null;
  while ((fencedMatch = fencedBlockPattern.exec(text)) !== null) {
    const candidate = fencedMatch[1]?.trim();
    if (candidate) {
      candidates.add(candidate);
    }
  }

  const markerPattern = /"tool_calls"|"function"/g;
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = markerPattern.exec(text)) !== null) {
    for (let index = markerMatch.index; index >= 0; index -= 1) {
      const character = text[index];
      if (character !== '{' && character !== '[') {
        continue;
      }

      const candidate = extractBalancedJsonSegment(text, index);
      if (candidate && candidate.includes(markerMatch[0])) {
        candidates.add(candidate.trim());
        break;
      }
    }
  }

  return [...candidates];
};

const parseXmlToolCalls = (text: string): ToolCall[] => {
  const calls: ToolCall[] = [];
  const regex = /<tool_use>\s*<tool name="(\w+)">(.*?)<\/tool>/gs;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const paramsMatch = match[2].match(/<tool_params>(.*?)<\/tool_params>/s);
    if (!paramsMatch) {
      continue;
    }

    try {
      const input = JSON.parse(paramsMatch[1]);
      const normalizedInput = normalizeParsedToolInput(input);
      if (!normalizedInput) {
        continue;
      }

      calls.push({
        ...createParsedToolCall(name, normalizedInput),
      });
    } catch {
      // Skip malformed params
    }
  }

  return calls;
};

const parseJsonToolCalls = (text: string): ToolCall[] => {
  for (const candidate of collectJsonProtocolCandidates(text)) {
    try {
      const calls = parseToolCallsFromJsonValue(JSON.parse(candidate));
      if (calls.length > 0) {
        return calls;
      }
    } catch {
      // Skip malformed JSON candidates
    }
  }

  return [];
};

// Tool call parser - extracts tool calls from LLM responses
export function parseToolCalls(text: string): ToolCall[] {
  const xmlCalls = parseXmlToolCalls(text);
  if (xmlCalls.length > 0) {
    return xmlCalls;
  }

  return parseJsonToolCalls(text);
}

export function containsToolProtocolMarkers(text: string): boolean {
  return TOOL_PROTOCOL_MARKER_PATTERN.test(text);
}

// Streaming tool call detector — incrementally parses XML tool calls from a stream.
// Returns newly detected complete tool calls each time feed() is called.
export type StreamingToolDetector = {
  feed: (delta: string) => ToolCall[];
  reset: () => void;
};

export const createStreamingToolDetector = (): StreamingToolDetector => {
  let buffer = '';
  let processedEnd = 0;

  return {
    feed: (delta: string) => {
      buffer += delta;
      const detected: ToolCall[] = [];
      const regex = /<tool_use>\s*<tool name="(\w+)">(.*?)<\/tool>\s*<\/tool_use>/gs;

      let match: RegExpExecArray | null;
      while ((match = regex.exec(buffer)) !== null) {
        if (match.index < processedEnd) continue;

        const name = match[1];
        const paramsMatch = match[2]!.match(/<tool_params>(.*?)<\/tool_params>/s);
        if (!paramsMatch) continue;

        try {
          const input = JSON.parse(paramsMatch[1]!);
          const normalizedInput = normalizeParsedToolInput(input);
          if (!normalizedInput) continue;

          detected.push(createParsedToolCall(name, normalizedInput));
        } catch {
          // Skip malformed params
        }

        processedEnd = regex.lastIndex;
      }

      return detected;
    },
    reset: () => {
      buffer = '';
      processedEnd = 0;
    },
  };
};

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
  file_path?: string;
  path?: string;
  file?: string;
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
  cwd?: string;
  shell?: 'bash' | 'powershell';
}

interface FetchParams {
  url: string;
  format: 'text' | 'json';
}
