import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ToolCall, ToolResult } from '../../../src/modules/ai/runtime/tools/toolExecutor.ts';
import { decodeCommandOutput } from './commandOutputDecoding.ts';
import {
  buildVerifiedFileChange,
  resolveEditStrings,
  resolveViewFilePathParam,
  resolveWriteFilePathParam,
  shouldCaptureFileChangeSnapshot,
  verifyEditFileMutation,
  verifyWriteFileMutation,
} from '../../../src/modules/ai/runtime/tools/toolExecutor.ts';

const execFile = promisify(execFileCallback);
const DEFAULT_TIMEOUT_MS = 60_000;

const normalizePath = (value: string) => value.replace(/\\/g, '/');
const isAbsolutePath = (value: string) => /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value);
const DIRECTORY_LISTING_MAX_DEPTH = 4;

const formatCommandOutput = (stdout: string, stderr: string) =>
  [stdout.trim(), stderr.trim() ? `Error: ${stderr.trim()}` : ''].filter(Boolean).join('\n');

export class NodeRuntimeToolExecutor {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  private normalizeProjectRoot() {
    return normalizePath(path.resolve(this.projectRoot)).replace(/\/+$/, '');
  }

  private ensureProjectPath(pathValue?: string, kind: 'file' | 'directory' = 'file') {
    const normalizedRoot = this.normalizeProjectRoot();
    const rawPath = (pathValue || this.projectRoot).trim();
    const candidatePath = rawPath || this.projectRoot;
    const resolvedPath = normalizePath(
      path.resolve(isAbsolutePath(candidatePath) ? candidatePath : path.join(normalizedRoot, candidatePath)),
    );
    const comparableResolved = resolvedPath.toLowerCase();
    const comparableRoot = normalizedRoot.toLowerCase();

    if (comparableResolved !== comparableRoot && !comparableResolved.startsWith(`${comparableRoot}/`)) {
      throw new Error(`Cannot access ${kind} outside the current project. Stay under ${this.projectRoot}.`);
    }

    return resolvedPath;
  }

  private toProjectRelativePath(filePath: string) {
    const normalizedPath = normalizePath(filePath);
    const normalizedRoot = this.normalizeProjectRoot();
    if (!normalizedPath.startsWith(normalizedRoot)) {
      return normalizedPath;
    }

    return normalizedPath.slice(normalizedRoot.length).replace(/^\/+/, '') || normalizedPath;
  }

  private async readTextFileSnapshot(filePath: string) {
    try {
      return await readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  private async listDirectoryEntries(
    directoryPath: string,
    maxDepth = DIRECTORY_LISTING_MAX_DEPTH,
  ): Promise<string[]> {
    const collected: string[] = [];

    const walk = async (currentPath: string, depth: number) => {
      if (depth >= maxDepth) {
        return;
      }

      const entries = await readdir(currentPath, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of entries) {
        const absoluteEntryPath = path.join(currentPath, entry.name);
        const relativeEntryPath = normalizePath(path.relative(directoryPath, absoluteEntryPath));
        if (!relativeEntryPath) {
          continue;
        }

        collected.push(`./${relativeEntryPath}`);
        if (entry.isDirectory()) {
          await walk(absoluteEntryPath, depth + 1);
        }
      }
    };

    await walk(directoryPath, 0);
    return collected;
  }

  private async runShell(
    command: string,
    cwd: string,
    options?: { timeout?: number; shell?: 'bash' | 'powershell' },
  ) {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const shell = options?.shell ?? (process.platform === 'win32' ? 'powershell' : 'bash');
    const file =
      shell === 'powershell'
        ? 'powershell.exe'
        : process.platform === 'win32'
          ? 'powershell.exe'
          : '/bin/zsh';
    const args = file === 'powershell.exe' ? ['-NoProfile', '-Command', command] : ['-lc', command];
    const { stdout, stderr } = await execFile(file, args, {
      cwd,
      encoding: 'buffer',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: decodeCommandOutput(stdout),
      stderr: decodeCommandOutput(stderr),
    };
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    try {
      switch (call.name) {
        case 'glob':
          return await this.glob(call.input);
        case 'grep':
          return await this.grep(call.input);
        case 'ls':
          return await this.ls(call.input);
        case 'view':
          return await this.view(call.input);
        case 'write':
          return await this.write(call.input);
        case 'edit':
          return await this.edit(call.input);
        case 'bash':
          return await this.bash(call.input);
        case 'powershell':
          return await this.bash({
            ...call.input,
            shell: 'powershell',
          });
        case 'fetch':
          return await this.fetchUrl(call.input);
        case 'agent':
          return {
            type: 'text',
            content: 'The built-in agent delegation tool is not available in the node runtime sidecar yet.',
            is_error: true,
          };
        default:
          return {
            type: 'text',
            content: `Unknown tool: ${call.name}`,
            is_error: true,
          };
      }
    } catch (error) {
      return {
        type: 'text',
        content: error instanceof Error ? error.message : String(error),
        is_error: true,
      };
    }
  }

  private async glob(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = typeof input.pattern === 'string' ? input.pattern : '';
    const searchPath = this.ensureProjectPath(typeof input.path === 'string' ? input.path : '.', 'directory');
    if (!pattern.trim()) {
      return { type: 'text', content: 'glob requires a pattern parameter.', is_error: true };
    }

    const { stdout } = await this.runShell(`rg --files . -g ${JSON.stringify(pattern)}`, searchPath);
    return { type: 'text', content: stdout.trim() || '(no matches)' };
  }

  private async grep(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = typeof input.pattern === 'string' ? input.pattern : '';
    const searchPath = this.ensureProjectPath(typeof input.path === 'string' ? input.path : '.', 'directory');
    if (!pattern.trim()) {
      return { type: 'text', content: 'grep requires a pattern parameter.', is_error: true };
    }

    const include = typeof input.include === 'string' && input.include.trim() ? ` -g ${JSON.stringify(input.include)}` : '';
    const literal = input.literal_text === true ? ' -F' : '';
    const command = `rg -n --no-heading --color never${literal}${include} ${JSON.stringify(pattern)} .`;

    try {
      const { stdout } = await this.runShell(command, searchPath);
      return { type: 'text', content: stdout.trim() || '(no matches)' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Command failed/.test(message)) {
        return { type: 'text', content: '(no matches)' };
      }
      throw error;
    }
  }

  private async ls(input: Record<string, unknown>): Promise<ToolResult> {
    const searchPath = this.ensureProjectPath(typeof input.path === 'string' ? input.path : '.', 'directory');
    const entries = await this.listDirectoryEntries(searchPath);
    return { type: 'text', content: entries.join('\n') || '(empty directory)' };
  }

  private async view(input: Record<string, unknown>): Promise<ToolResult> {
    const requestedFilePath = resolveViewFilePathParam(input);
    if (!requestedFilePath) {
      return { type: 'text', content: 'view requires a file_path parameter.', is_error: true };
    }

    const filePath = this.ensureProjectPath(requestedFilePath, 'file');
    const offset = typeof input.offset === 'number' ? Math.max(0, input.offset) : 0;
    const limit = typeof input.limit === 'number' ? Math.max(1, input.limit) : 2000;
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').slice(offset, offset + limit);
    const numbered = lines.map((line, index) => `${offset + index + 1}\t${line}`).join('\n');
    return { type: 'text', content: numbered || '(empty file)' };
  }

  private async write(input: Record<string, unknown>): Promise<ToolResult> {
    const requestedFilePath = resolveWriteFilePathParam(input);
    if (!requestedFilePath) {
      return { type: 'text', content: 'write requires a file_path parameter.', is_error: true };
    }

    const filePath = this.ensureProjectPath(requestedFilePath, 'file');
    const content = String(input.content ?? '');
    const captureSnapshot = shouldCaptureFileChangeSnapshot(filePath, content.length);
    const beforeContent = captureSnapshot ? await this.readTextFileSnapshot(filePath) : null;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    const verified = await verifyWriteFileMutation({
      filePath,
      expectedContent: content,
      readTextFile: (nextPath) => this.readTextFileSnapshot(nextPath),
    });

    return {
      type: 'text',
      content: verified ? `Wrote ${this.toProjectRelativePath(filePath)}` : `Write verification failed: ${filePath}`,
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
  }

  private async edit(input: Record<string, unknown>): Promise<ToolResult> {
    const requestedFilePath = resolveWriteFilePathParam(input);
    const editStrings = resolveEditStrings(input);
    if (!requestedFilePath || !editStrings) {
      return {
        type: 'text',
        content: 'edit requires file_path, old_string, and new_string parameters.',
        is_error: true,
      };
    }

    const filePath = this.ensureProjectPath(requestedFilePath, 'file');
    const beforeContent = await this.readTextFileSnapshot(filePath);
    if (typeof beforeContent !== 'string') {
      return { type: 'text', content: `File not found: ${requestedFilePath}`, is_error: true };
    }

    if (!beforeContent.includes(editStrings.oldString)) {
      return { type: 'text', content: 'edit old_string was not found in the target file.', is_error: true };
    }

    const afterContent = beforeContent.replace(editStrings.oldString, editStrings.newString);
    await writeFile(filePath, afterContent, 'utf8');
    const verified = await verifyEditFileMutation({
      filePath,
      beforeContent,
      newString: editStrings.newString,
      readTextFile: (nextPath) => this.readTextFileSnapshot(nextPath),
    });

    return {
      type: 'text',
      content: verified ? `Edited ${this.toProjectRelativePath(filePath)}` : `Edit verification failed: ${filePath}`,
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
  }

  private async bash(input: Record<string, unknown>): Promise<ToolResult> {
    const command = typeof input.command === 'string' ? input.command : '';
    if (!command.trim()) {
      return { type: 'text', content: 'bash requires a command parameter.', is_error: true };
    }

    const cwd = this.ensureProjectPath(typeof input.cwd === 'string' ? input.cwd : '.', 'directory');
    const timeout = typeof input.timeout === 'number' ? input.timeout : DEFAULT_TIMEOUT_MS;
    const shell = input.shell === 'powershell' ? 'powershell' : 'bash';
    const { stdout, stderr } = await this.runShell(command, cwd, { timeout, shell });
    return {
      type: 'text',
      content: formatCommandOutput(stdout, stderr) || '(no output)',
    };
  }

  private async fetchUrl(input: Record<string, unknown>): Promise<ToolResult> {
    const url = typeof input.url === 'string' ? input.url : '';
    if (!url.trim()) {
      return { type: 'text', content: 'fetch requires a url parameter.', is_error: true };
    }

    const response = await fetch(url);
    const text = await response.text();
    return {
      type: 'text',
      content: `Fetched from ${url}:\n\n${text.slice(0, 5000)}${text.length > 5000 ? '\n...(truncated)' : ''}`,
      is_error: !response.ok,
    };
  }
}
