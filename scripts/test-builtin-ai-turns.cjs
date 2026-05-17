const { Module } = require('module');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_APP_ORIGIN = 'http://localhost:1420';
const DEFAULT_USER_DATA_DIR =
  'C:\\Users\\Even\\AppData\\Local\\com.goodnight.app\\EBWebView';
const DEFAULT_PROMPTS = [
  '用一句话介绍你自己，不要展示任何内部协议或思考过程。',
  '这个项目里的 built-in AI 测试入口在哪里？给我最短答案。',
  '列出当前项目里和 built-in AI 相关的两个关键文件路径。',
  '请帮我总结这个项目是做什么的，别提内部工作流文件。',
];
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.tmp',
  '.worktrees',
  '.claude',
  '.gstack',
  '.superpowers',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  '.next',
  '.turbo',
  '.idea',
  '.vscode',
]);
const DEFAULT_GLOB_LIMIT = 200;
const DEFAULT_GREP_LIMIT = 50;
const INTERNAL_CONTEXT_PATTERN =
  /(^|[/\\])(?:_goodnight|\.goodnight|\.ai)([/\\]|$)|\b(?:GOODNIGHT|CLAUDE)\.md\b/i;
const PROTOCOL_LEAK_PATTERN =
  /<tool_use>|<\/tool_use>|<tool_result|<\/tool_result>|<apply_skill\b|<\s*\|\s*DSML\b|tool_calls>/i;
const PROCESS_NARRATION_PATTERN =
  /^(?:好的[，,\s]*)?(?:我先|让我先|现在我来|接下来我会先|我会先|let me|first[, ]+i(?:'| wi)?ll)/i;
const TOOL_RESULT_MARKER = /^Tool\s+\S+\s+result:/i;
const TOOL_LOOP_EXHAUSTED_PATTERN =
  /^Runtime tool loop exhausted after \d+ rounds before the model returned final content\.$/i;
const PROJECT_FACT_PROMPT_PATTERN =
  /(?:\b(?:this|current)\s+project\b|\bbuilt-in ai\b|这个项目|当前项目|项目里|项目中|代码库|仓库)/i;
const TEMP_ARTIFACT_PATTERN = /(?:^|[/\\])(?:\.tmp|\.worktrees)(?:[/\\]|$)|\.log\b/i;

const resolvePlaywright = () => {
  const {
    buildDefaultNodeModulesCandidates,
    pickPreferredNodeModulesRoot,
  } = require(path.resolve(__dirname, 'lib', 'builtinPlaywrightResolver.cjs'));
  const candidates = buildDefaultNodeModulesCandidates(__dirname);
  const preferredCandidate = pickPreferredNodeModulesRoot(candidates);
  const orderedCandidates = preferredCandidate
    ? [preferredCandidate, ...candidates.filter((candidate) => candidate !== preferredCandidate)]
    : candidates;

  let lastError = null;
  for (const candidate of orderedCandidates) {
    process.env.NODE_PATH = candidate;
    Module._initPaths();
    try {
      return require('playwright');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to resolve playwright.');
};

const maskApiKey = (value) => {
  if (!value) return '(empty)';
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const normalizePath = (value) => value.replace(/\\/g, '/');

const toProjectRelativePath = (projectRoot, candidatePath) => {
  const normalizedRoot = normalizePath(projectRoot).replace(/\/+$/, '');
  const normalizedCandidate = normalizePath(candidatePath);
  if (!normalizedCandidate.startsWith(normalizedRoot)) {
    return normalizedCandidate;
  }

  return normalizedCandidate.slice(normalizedRoot.length).replace(/^\/+/, '') || normalizedCandidate;
};

const ensureInsideProject = (projectRoot, candidatePath, kind = 'file') => {
  const absolutePath = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(projectRoot, candidatePath);
  const normalizedRoot = normalizePath(path.resolve(projectRoot)).toLowerCase().replace(/\/+$/, '');
  const normalizedCandidate = normalizePath(absolutePath).toLowerCase();

  if (
    normalizedCandidate !== normalizedRoot &&
    !normalizedCandidate.startsWith(`${normalizedRoot}/`)
  ) {
    throw new Error(`Cannot access ${kind} outside the current project. Stay under ${projectRoot}.`);
  }

  return absolutePath;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const globToRegExp = (pattern) => {
  const normalized = normalizePath(pattern).replace(/\*\*/g, '::DOUBLE_STAR::');
  const escaped = escapeRegExp(normalized)
    .replace(/::DOUBLE_STAR::/g, '.*')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '[^/]');
  return new RegExp(`^${escaped}$`, 'i');
};

const walkProjectFiles = async (projectRoot) => {
  const results = [];
  const queue = [path.resolve(projectRoot)];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  return results;
};

const readConfigFromWebView = async () => {
  const { chromium } = resolvePlaywright();
  const origin = process.env.GN_APP_ORIGIN || DEFAULT_APP_ORIGIN;
  const userDataDir = process.env.GN_USER_DATA_DIR || DEFAULT_USER_DATA_DIR;
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'msedge',
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(origin, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForTimeout(2000);

    const raw = await page.evaluate(() => localStorage.getItem('goodnight-ai-store'));
    if (!raw) {
      throw new Error('goodnight-ai-store was not found in app localStorage.');
    }

    const parsed = JSON.parse(raw);
    const state = parsed.state;
    const selected = state.aiConfigs.find((item) => item.id === state.selectedConfigId);
    if (!selected) {
      throw new Error(`Selected config ${state.selectedConfigId || '(null)'} was not found.`);
    }

    return {
      origin,
      userDataDir,
      selected,
    };
  } finally {
    await context.close();
  }
};

const createReadOnlyToolExecutor = (projectRoot) => {
  const projectFilesPromise = walkProjectFiles(projectRoot);

  const readFileSlice = async (filePath, offset = 0, limit = 200) => {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split(/\r?\n/)
      .slice(offset, offset + limit)
      .map((line, index) => `${offset + index + 1}: ${line}`)
      .join('\n');
  };

  return async (call) => {
    const input = call.input || {};

    if (call.name === 'view') {
      const candidate = String(input.file_path || input.path || input.file || '').trim();
      if (!candidate) {
        return { type: 'text', content: 'view requires a file_path parameter.', is_error: true };
      }

      const filePath = ensureInsideProject(projectRoot, candidate, 'file');
      return {
        type: 'text',
        content: await readFileSlice(filePath, Number(input.offset || 0), Number(input.limit || 200)),
      };
    }

    if (call.name === 'ls') {
      const candidate = String(input.path || '.').trim() || '.';
      const dirPath = ensureInsideProject(projectRoot, candidate, 'directory');
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return {
        type: 'text',
        content: entries
          .map((entry) => `${entry.isDirectory() ? '[D]' : '[F]'} ${entry.name}`)
          .join('\n'),
      };
    }

    if (call.name === 'glob') {
      const pattern = String(input.pattern || '**/*').trim() || '**/*';
      const relativeRoot = String(input.path || '.').trim() || '.';
      const absoluteRoot = ensureInsideProject(projectRoot, relativeRoot, 'directory');
      const matcher = globToRegExp(pattern);
      const projectFiles = await projectFilesPromise;
      const matched = projectFiles
        .filter((filePath) => normalizePath(filePath).startsWith(normalizePath(absoluteRoot)))
        .map((filePath) => toProjectRelativePath(projectRoot, filePath))
        .filter((relativePath) => matcher.test(relativePath))
        .slice(0, DEFAULT_GLOB_LIMIT);
      return {
        type: 'text',
        content: matched.length > 0 ? matched.join('\n') : '(no matches)',
      };
    }

    if (call.name === 'grep') {
      const pattern = String(input.pattern || '').trim();
      if (!pattern) {
        return { type: 'text', content: 'grep requires a pattern parameter.', is_error: true };
      }

      const relativeRoot = String(input.path || '.').trim() || '.';
      const includePattern = String(input.include || '**/*').trim() || '**/*';
      const literalText = Boolean(input.literal_text);
      const absoluteRoot = ensureInsideProject(projectRoot, relativeRoot, 'directory');
      const includeMatcher = globToRegExp(includePattern);
      const projectFiles = await projectFilesPromise;
      const matchedFiles = projectFiles
        .filter((filePath) => normalizePath(filePath).startsWith(normalizePath(absoluteRoot)))
        .map((filePath) => ({
          absolutePath: filePath,
          relativePath: toProjectRelativePath(projectRoot, filePath),
        }))
        .filter((entry) => includeMatcher.test(entry.relativePath));

      const matcher = literalText ? null : new RegExp(pattern, 'i');
      const lines = [];

      for (const file of matchedFiles) {
        const content = await fs.readFile(file.absolutePath, 'utf8').catch(() => null);
        if (typeof content !== 'string') {
          continue;
        }

        const fileLines = content.split(/\r?\n/);
        for (let index = 0; index < fileLines.length; index += 1) {
          const line = fileLines[index];
          const hit = literalText ? line.includes(pattern) : matcher.test(line);
          if (!hit) {
            continue;
          }

          lines.push(`${file.relativePath}:${index + 1}: ${line.trim()}`);
          if (lines.length >= DEFAULT_GREP_LIMIT) {
            return { type: 'text', content: lines.join('\n') };
          }
        }
      }

      return {
        type: 'text',
        content: lines.length > 0 ? lines.join('\n') : '(no matches)',
      };
    }

    return {
      type: 'text',
      content: `Tool ${call.name} is not supported in this smoke script.`,
      is_error: true,
    };
  };
};

const collectVisibleAssistantMessages = (transcript, sanitizeAgentVisibleText) => {
  const entries = [];

  for (let index = 0; index < transcript.length; index += 1) {
    const message = transcript[index];
    if (message.role !== 'assistant') {
      continue;
    }

    const visible = sanitizeAgentVisibleText(message.content || '').trim();
    if (!visible) {
      continue;
    }

    entries.push({ index, text: visible });
  }

  return entries;
};

const analyzeTranscriptOrder = (transcript, sanitizeAgentVisibleText) => {
  const firstToolResultIndex = transcript.findIndex(
    (message) => message.role === 'user' && TOOL_RESULT_MARKER.test(message.content || '')
  );
  const visibleAssistantMessages = collectVisibleAssistantMessages(transcript, sanitizeAgentVisibleText);
  const preToolMessages =
    firstToolResultIndex >= 0
      ? visibleAssistantMessages.filter((entry) => entry.index < firstToolResultIndex)
      : [];
  const lastVisibleAssistantIndex =
    visibleAssistantMessages.length > 0
      ? visibleAssistantMessages[visibleAssistantMessages.length - 1].index
      : -1;
  const issues = [];

  if (preToolMessages.length > 1) {
    issues.push('multiple_visible_preambles_before_tool');
  }

  if (preToolMessages.some((entry) => !PROCESS_NARRATION_PATTERN.test(entry.text))) {
    issues.push('non_progress_visible_copy_before_tool');
  }

  if (firstToolResultIndex >= 0 && lastVisibleAssistantIndex >= 0 && lastVisibleAssistantIndex < firstToolResultIndex) {
    issues.push('final_copy_before_tool_result');
  }

  return {
    firstToolResultIndex,
    visibleAssistantMessages,
    preToolMessages,
    issues,
  };
};

const buildPromptIssues = (result) => {
  const issues = [];
  const answer = result.answerContent || result.finalContent || '';

  if (PROTOCOL_LEAK_PATTERN.test(answer)) {
    issues.push('protocol_leak');
  }

  if (INTERNAL_CONTEXT_PATTERN.test(answer)) {
    issues.push('internal_context_leak');
  }

  if (PROCESS_NARRATION_PATTERN.test(answer.trim())) {
    issues.push('visible_process_narration');
  }

  if (!answer.trim()) {
    issues.push('empty_visible_answer');
  }

  if (TOOL_LOOP_EXHAUSTED_PATTERN.test((result.finalContent || '').trim())) {
    issues.push('tool_loop_exhausted');
  }

  if (PROJECT_FACT_PROMPT_PATTERN.test(result.prompt) && result.toolCalls.length === 0) {
    issues.push('ungrounded_project_answer');
  }

  if (TEMP_ARTIFACT_PATTERN.test(answer)) {
    issues.push('temp_artifact_leak');
  }

  return [...issues, ...(result.transcriptOrder?.issues || [])];
};

const main = async () => {
  const [
    { aiService },
    { executeRuntimeBuiltInAgentTurn },
    { buildAssistantStructuredContentState },
    { sanitizeAgentVisibleText },
  ] =
    await Promise.all([
      import(pathToFileURL(path.resolve('src/modules/ai/core/AIService.ts')).href),
      import(
        pathToFileURL(
          path.resolve('src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts')
        ).href
      ),
      import(pathToFileURL(path.resolve('src/components/workspace/aiChatMessageParts.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/runtime/dispatch/agentEvents.ts')).href),
    ]);
  const { selected, origin, userDataDir } = await readConfigFromWebView();
  const projectRoot = process.cwd();
  const prompts =
    process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_PROMPTS;
  const executeTool = createReadOnlyToolExecutor(projectRoot);

  aiService.setConfig({
    provider: selected.provider,
    apiKey: selected.apiKey,
    baseURL: selected.baseURL,
    model: selected.model,
    contextWindowTokens: selected.contextWindowTokens || 258000,
    maxTokens: selected.maxTokens || 4096,
    temperature: typeof selected.temperature === 'number' ? selected.temperature : 0.2,
    customHeaders: selected.customHeaders || '',
    projectRoot,
  });

  const promptReports = [];

  for (const prompt of prompts) {
    const result = await executeRuntimeBuiltInAgentTurn({
      projectId: 'builtin-ai-smoke',
      projectName: path.basename(projectRoot),
      threadId: `builtin-ai-smoke-${Date.now()}`,
      projectRoot,
      userInput: prompt,
      rawUserInput: prompt,
      conversationHistory: [],
      agentInstructions: [],
      referenceFiles: [],
      memoryEntries: [],
      activeSkills: [],
      skillIntent: null,
      contextLabels: [],
      allowedTools: ['glob', 'grep', 'ls', 'view'],
      executeModel: (runtimePrompt, systemPrompt, onEvent) =>
        Array.isArray(runtimePrompt)
          ? aiService.completeMessages({
              messages: runtimePrompt,
              systemPrompt,
              onEvent,
            })
          : aiService.completeText({
              prompt: runtimePrompt,
              systemPrompt,
              onEvent,
            }),
      executeTool,
    });

    const structured = buildAssistantStructuredContentState({
      content: result.finalContent,
      thinkingCollapsed: true,
    });
    const transcriptOrder = analyzeTranscriptOrder(result.transcript || [], sanitizeAgentVisibleText);
    const issues = buildPromptIssues({
      prompt,
      toolCalls: result.toolCalls,
      finalContent: result.finalContent,
      answerContent: structured.answerContent,
      transcriptOrder,
    });

    promptReports.push({
      prompt,
      toolCalls: result.toolCalls.map((call) => ({
        name: call.name,
        status: call.status,
        input: call.input,
        resultPreview: call.resultPreview,
      })),
      finalContent: result.finalContent,
      thinkingContent: structured.thinkingContent,
      answerContent: structured.answerContent,
      transcriptOrder: {
        firstToolResultIndex: transcriptOrder.firstToolResultIndex,
        preToolVisibleMessages: transcriptOrder.preToolMessages.map((entry) => entry.text),
        visibleAssistantMessages: transcriptOrder.visibleAssistantMessages.map((entry) => entry.text),
      },
      issues,
    });
  }

  const allIssues = [...new Set(promptReports.flatMap((report) => report.issues))];

  console.log(
    JSON.stringify(
      {
        selectedConfigId: selected.id,
        provider: selected.provider,
        baseURL: selected.baseURL,
        model: selected.model,
        apiKeyPreview: maskApiKey(selected.apiKey),
        appOrigin: origin,
        userDataDir,
        projectRoot,
        promptsTested: prompts.length,
        issuesFound: allIssues,
        promptReports,
        note: [
          'This script runs the real built-in runtime orchestration path in Node.',
          'It reuses the active built-in config from goodnight-ai-store and implements read-only project tools locally.',
          'http://localhost:1420 alone is not a valid end-to-end built-in UI target because the page does not have the Tauri runtime bridge.',
        ].join(' '),
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
