const { Module } = require('module');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_APP_ORIGIN = 'http://localhost:1420';
const DEFAULT_USER_DATA_DIR =
  'C:\\Users\\Even\\AppData\\Local\\com.goodnight.app\\EBWebView';
const DEFAULT_NODE_MODULES =
  'C:\\Users\\Even\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules';
const DEFAULT_ALLOWED_TOOLS = ['glob', 'grep', 'ls', 'view', 'write', 'edit'];
const READ_ONLY_TOOLS = ['glob', 'grep', 'ls', 'view'];
const PROCESS_NARRATION_PATTERN =
  /^(?:好的[，,\s]*)?(?:我先|让我先|现在我来|接下来我会先|我会先|let me|first[, ]+i(?:'| wi)?ll)/i;
const TOOL_RESULT_MARKER = /^Tool\s+\S+\s+result:/i;

const resolvePlaywright = () => {
  const candidates = [
    process.env.GN_NODE_PATH,
    process.env.NODE_PATH,
    DEFAULT_NODE_MODULES,
  ].filter(Boolean);

  let lastError = null;
  for (const candidate of candidates) {
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

const toProjectRelativePath = (projectRoot, candidatePath) => {
  const normalizedRoot = normalizePath(path.resolve(projectRoot)).replace(/\/+$/, '');
  const normalizedCandidate = normalizePath(path.resolve(candidatePath));
  if (!normalizedCandidate.startsWith(normalizedRoot)) {
    return normalizedCandidate;
  }

  return normalizedCandidate.slice(normalizedRoot.length).replace(/^\/+/, '') || normalizedCandidate;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveToolFilePathParam = (input) => {
  const candidate = input.file_path ?? input.filePath ?? input.path ?? input.target ?? input.file;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
};

const resolveEditStrings = (input) => {
  const oldCandidate = input.old_string ?? input.oldString ?? input.pattern;
  const newCandidate = input.new_string ?? input.newString ?? input.replace ?? input.replacement;

  if (typeof oldCandidate !== 'string' || typeof newCandidate !== 'string') {
    return null;
  }

  return {
    oldString: oldCandidate,
    newString: newCandidate,
  };
};

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
        queue.push(fullPath);
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

const setupSandbox = async (repoRoot) => {
  const sandboxRoot = path.resolve(repoRoot, '.tmp', 'builtin-ai-file-ops-smoke');
  await fs.rm(sandboxRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(sandboxRoot, 'notes'), { recursive: true });
  await fs.mkdir(path.join(sandboxRoot, 'docs'), { recursive: true });
  await fs.writeFile(path.join(sandboxRoot, 'notes', 'source.txt'), 'ORANGE\nSECOND\n', 'utf8');
  await fs.writeFile(path.join(sandboxRoot, 'notes', 'remove-me.txt'), 'DELETE_ME\n', 'utf8');
  return sandboxRoot;
};

const createLocalToolExecutor = (projectRoot) => {
  const projectFilesPromise = walkProjectFiles(projectRoot);

  const readFileLines = async (filePath, offset = 0, limit = 200) => {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split(/\r?\n/)
      .slice(offset, offset + limit)
      .map((line, index) => `${offset + index + 1}: ${line}`)
      .join('\n');
  };

  const executeTool = async (call) => {
    const input = call.input || {};

    if (call.name === 'view') {
      const candidate = resolveToolFilePathParam(input);
      if (!candidate) {
        return { type: 'text', content: 'view requires a file_path parameter.', is_error: true };
      }
      const filePath = ensureInsideProject(projectRoot, candidate, 'file');
      return {
        type: 'text',
        content: await readFileLines(filePath, Number(input.offset || 0), Number(input.limit || 200)),
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
      const matcher = globToRegExp(pattern);
      const files = await projectFilesPromise;
      const matched = files
        .map((filePath) => toProjectRelativePath(projectRoot, filePath))
        .filter((relativePath) => matcher.test(relativePath))
        .slice(0, 200);
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

      const includePattern = String(input.include || '**/*').trim() || '**/*';
      const includeMatcher = globToRegExp(includePattern);
      const literalText = Boolean(input.literal_text);
      const matcher = literalText ? null : new RegExp(pattern, 'i');
      const files = await projectFilesPromise;
      const hits = [];

      for (const filePath of files) {
        const relativePath = toProjectRelativePath(projectRoot, filePath);
        if (!includeMatcher.test(relativePath)) {
          continue;
        }

        const content = await fs.readFile(filePath, 'utf8').catch(() => null);
        if (typeof content !== 'string') {
          continue;
        }

        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const matched = literalText ? line.includes(pattern) : matcher.test(line);
          if (!matched) {
            continue;
          }

          hits.push(`${relativePath}:${index + 1}: ${line.trim()}`);
          if (hits.length >= 50) {
            return { type: 'text', content: hits.join('\n') };
          }
        }
      }

      return {
        type: 'text',
        content: hits.length > 0 ? hits.join('\n') : '(no matches)',
      };
    }

    if (call.name === 'write') {
      const candidate = resolveToolFilePathParam(input);
      if (!candidate) {
        return { type: 'text', content: 'write requires a file_path parameter.', is_error: true };
      }

      const filePath = ensureInsideProject(projectRoot, candidate, 'file');
      const beforeContent = await fs.readFile(filePath, 'utf8').catch(() => null);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, String(input.content || ''), 'utf8');
      const afterContent = await fs.readFile(filePath, 'utf8');
      return {
        type: 'text',
        content: `File successfully written: ${toProjectRelativePath(projectRoot, filePath)}`,
        metadata: {
          fileChanges: [
            {
              path: toProjectRelativePath(projectRoot, filePath),
              operation: 'write',
              beforeContent,
              afterContent,
              verified: true,
            },
          ],
        },
      };
    }

    if (call.name === 'edit') {
      const candidate = resolveToolFilePathParam(input);
      if (!candidate) {
        return { type: 'text', content: 'edit requires a file_path parameter.', is_error: true };
      }
      const editStrings = resolveEditStrings(input);
      if (!editStrings) {
        return { type: 'text', content: 'edit requires old_string and new_string parameters.', is_error: true };
      }

      const filePath = ensureInsideProject(projectRoot, candidate, 'file');
      const beforeContent = await fs.readFile(filePath, 'utf8').catch(() => null);
      if (beforeContent === null) {
        return { type: 'text', content: `File not found: ${candidate}`, is_error: true };
      }

      const { oldString, newString } = editStrings;
      if (!beforeContent.includes(oldString)) {
        return { type: 'text', content: `old_string not found in file: ${candidate}`, is_error: true };
      }

      const afterContent = beforeContent.replace(oldString, newString);
      await fs.writeFile(filePath, afterContent, 'utf8');
      return {
        type: 'text',
        content: `File successfully edited: ${toProjectRelativePath(projectRoot, filePath)}`,
        metadata: {
          fileChanges: [
            {
              path: toProjectRelativePath(projectRoot, filePath),
              operation: 'edit',
              beforeContent,
              afterContent,
              verified: true,
            },
          ],
        },
      };
    }

    return {
      type: 'text',
      content: `Tool "${call.name}" is not supported in this smoke script.`,
      is_error: true,
    };
  };

  const invokeProjectFileTool = async (command, params) => {
    const candidate = String(params.file_path || '').trim();
    const filePath = ensureInsideProject(projectRoot, candidate, 'file');

    if (command === 'tool_mkdir') {
      await fs.mkdir(filePath, { recursive: true });
      return { success: true, content: '', error: null };
    }

    if (command === 'tool_write') {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, String(params.content || ''), 'utf8');
      return { success: true, content: '', error: null };
    }

    if (command === 'tool_edit') {
      const beforeContent = await fs.readFile(filePath, 'utf8').catch(() => null);
      if (beforeContent === null) {
        return { success: false, content: '', error: `File not found: ${candidate}` };
      }
      const oldString = String(params.old_string || '');
      if (!beforeContent.includes(oldString)) {
        return { success: false, content: '', error: `old_string not found in file: ${candidate}` };
      }
      const afterContent = beforeContent.replace(oldString, String(params.new_string || ''));
      await fs.writeFile(filePath, afterContent, 'utf8');
      return { success: true, content: '', error: null };
    }

    if (command === 'tool_view') {
      const exists = await fs.readFile(filePath, 'utf8').then(() => true).catch(() => false);
      return exists
        ? { success: true, content: '', error: null }
        : { success: false, content: '', error: `File not found: ${candidate}` };
    }

    if (command === 'tool_remove') {
      await fs.rm(filePath, { force: true });
      return { success: true, content: '', error: null };
    }

    return { success: false, content: '', error: `Unsupported command: ${command}` };
  };

  return {
    executeTool,
    invokeProjectFileTool,
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

const main = async () => {
  const repoRoot = process.cwd();
  const sandboxRoot = await setupSandbox(repoRoot);
  const [{ aiService }, { runAgentTurn }, { buildRuntimeDirectChatRequest, normalizeRuntimeDirectChatResponse }, { buildAssistantStructuredContentState }, { sanitizeAgentVisibleText }, { runRuntimeToolLoop }, { buildRuntimeProjectFilePlanningSystemPrompt, prepareProjectFileProposalFlow }, { buildProjectFilePlanningPrompt }, projectFileOperations] =
    await Promise.all([
      import(pathToFileURL(path.resolve('src/modules/ai/core/AIService.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/runtime/agent-kernel/runAgentTurn.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/runtime/orchestration/runtimeDirectChatFlow.ts')).href),
      import(pathToFileURL(path.resolve('src/components/workspace/aiChatMessageParts.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/runtime/dispatch/agentEvents.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/runtime/tools/runtimeToolLoop.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/runtime/orchestration/runtimeProjectFileFlow.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/chat/projectFilePlanningPrompt.ts')).href),
      import(pathToFileURL(path.resolve('src/modules/ai/chat/projectFileOperations.ts')).href),
    ]);
  const { executeRuntimeProjectFileOperations } = await import(
    pathToFileURL(path.resolve('src/modules/ai/runtime/orchestration/runtimeProjectFileExecutionFlow.ts')).href
  );
  const { selected, origin, userDataDir } = await readConfigFromWebView();
  const { executeTool, invokeProjectFileTool } = createLocalToolExecutor(sandboxRoot);

  aiService.setConfig({
    provider: selected.provider,
    apiKey: selected.apiKey,
    baseURL: selected.baseURL,
    model: selected.model,
    contextWindowTokens: selected.contextWindowTokens || 258000,
    maxTokens: selected.maxTokens || 4096,
    temperature: typeof selected.temperature === 'number' ? selected.temperature : 0.2,
    customHeaders: selected.customHeaders || '',
    projectRoot: sandboxRoot,
  });

  const buildDirectChat = (userInput) =>
    buildRuntimeDirectChatRequest({
      projectId: 'builtin-ai-file-ops-smoke',
      projectName: path.basename(sandboxRoot),
      threadId: `builtin-ai-file-ops-${Date.now()}`,
      userInput,
      agentsInstructions: [],
      referenceFiles: [],
      memoryEntries: [],
      activeSkills: [],
      currentProjectName: path.basename(sandboxRoot),
      contextWindowTokens: selected.contextWindowTokens || 258000,
      skillIntent: null,
      conversationHistory: [],
      contextLabels: [],
    });

  const runBuiltInScenario = async (name, prompt, verify) => {
    const directChat = buildDirectChat(prompt);
    const agentTurn = await runAgentTurn({
      projectId: 'builtin-ai-file-ops-smoke',
      projectName: path.basename(sandboxRoot),
      threadId: `builtin-ai-file-ops-${Date.now()}`,
      projectRoot: sandboxRoot,
      userInput: prompt,
      contextWindowTokens: selected.contextWindowTokens || 258000,
      conversationHistory: [],
      instructions: [],
      referenceFiles: [],
      memoryEntries: [],
      activeSkills: [],
      allowedTools: DEFAULT_ALLOWED_TOOLS,
      executeModel: (runtimePrompt, _systemPrompt, onEvent) =>
        aiService.completeText({
          prompt: runtimePrompt,
          systemPrompt: directChat.systemPrompt,
          onEvent,
        }),
      executeTool,
    });

    const normalizedFinalContent = normalizeRuntimeDirectChatResponse({
      response: agentTurn.finalContent,
      streamedContent: agentTurn.finalContent,
    });
    const structured = buildAssistantStructuredContentState({
      content: normalizedFinalContent,
      thinkingCollapsed: true,
    });
    const transcriptOrder = analyzeTranscriptOrder(agentTurn.transcript, sanitizeAgentVisibleText);
    const verification = await verify();
    const issues = [...transcriptOrder.issues];

    if (!verification.ok) {
      issues.push(verification.issue || 'verification_failed');
    }

    return {
      name,
      route: 'built-in-turn',
      prompt,
      toolCalls: agentTurn.toolCalls.map((toolCall) => ({
        name: toolCall.name,
        status: toolCall.status,
        input: toolCall.input,
        resultPreview: toolCall.resultPreview,
      })),
      finalContent: normalizedFinalContent,
      answerContent: structured.answerContent,
      transcriptOrder: {
        firstToolResultIndex: transcriptOrder.firstToolResultIndex,
        preToolVisibleMessages: transcriptOrder.preToolMessages.map((entry) => entry.text),
        visibleAssistantMessages: transcriptOrder.visibleAssistantMessages.map((entry) => entry.text),
      },
      verification,
      issues,
    };
  };

  const readScenario = await runBuiltInScenario(
    'read_file',
    '读取 notes/source.txt 的第一行，只返回那一行内容，不要加解释。',
    async () => {
      const fileContent = await fs.readFile(path.join(sandboxRoot, 'notes', 'source.txt'), 'utf8');
      return {
        ok: fileContent.startsWith('ORANGE\n'),
        observedFirstLine: fileContent.split(/\r?\n/)[0],
      };
    }
  );

  const writeScenario = await runBuiltInScenario(
    'write_file',
    '在 docs/output.txt 新建文件，内容必须完全是：\nAlpha\nBeta\n完成后只用一句话确认。',
    async () => {
      const targetPath = path.join(sandboxRoot, 'docs', 'output.txt');
      const content = await fs.readFile(targetPath, 'utf8').catch(() => null);
      return {
        ok: content === 'Alpha\nBeta\n',
        path: 'docs/output.txt',
        content,
        issue:
          content === 'Alpha\nBeta\n'
            ? undefined
            : content === null
              ? 'write_missing_file'
              : 'write_content_mismatch',
      };
    }
  );

  const editScenario = await runBuiltInScenario(
    'edit_file',
    '把 docs/output.txt 里的 Beta 改成 Gamma，完成后只用一句话确认。',
    async () => {
      const targetPath = path.join(sandboxRoot, 'docs', 'output.txt');
      const content = await fs.readFile(targetPath, 'utf8').catch(() => null);
      return {
        ok: content === 'Alpha\nGamma\n',
        path: 'docs/output.txt',
        content,
        issue:
          content === 'Alpha\nGamma\n'
            ? undefined
            : content === null
              ? 'edit_missing_file'
              : 'edit_content_mismatch',
      };
    }
  );

  const planningPrompt = '删除 notes/remove-me.txt。';
  const planningLoop = await runRuntimeToolLoop({
    maxRounds: 8,
    initialPrompt: buildProjectFilePlanningPrompt({
      userInput: planningPrompt,
      conversationHistory: [],
    }),
    systemPrompt: buildRuntimeProjectFilePlanningSystemPrompt(path.basename(sandboxRoot), sandboxRoot),
    allowedTools: READ_ONLY_TOOLS,
    callModel: (messages, systemPrompt, onEvent) =>
      aiService.completeText({
        prompt: messages.map((message) => `${message.role}:\n${message.content}`).join('\n\n'),
        systemPrompt,
        onEvent,
      }),
    executeTool,
  });
  const parsedPlan = projectFileOperations.parseProjectFileOperationsPlan(planningLoop.finalContent);
  const preparedDeleteFlow =
    parsedPlan.status === 'ready'
      ? prepareProjectFileProposalFlow({
          proposalId: `delete-smoke-${Date.now()}`,
          mode: 'manual',
          plan: parsedPlan,
          sandboxPolicy: 'ask',
        })
      : null;
  const deleteExecution =
    parsedPlan.status === 'ready'
      ? await executeRuntimeProjectFileOperations({
          projectRoot: sandboxRoot,
          operations: parsedPlan.operations,
          resolveProjectOperationPath: projectFileOperations.resolveProjectOperationPath,
          isSupportedProjectTextFilePath: projectFileOperations.isSupportedProjectTextFilePath,
          readProjectTextFile: async (filePath) => fs.readFile(filePath, 'utf8').catch(() => null),
          getDirectoryPath: path.dirname,
          invokeTool: invokeProjectFileTool,
        })
      : null;
  const deleteExists = await fs
    .readFile(path.join(sandboxRoot, 'notes', 'remove-me.txt'), 'utf8')
    .then(() => true)
    .catch(() => false);
  const deleteIssues = [];
  if (parsedPlan.status !== 'ready') {
    deleteIssues.push('delete_plan_not_ready');
  } else if (!parsedPlan.operations.some((operation) => operation.type === 'delete_file')) {
    deleteIssues.push('delete_plan_missing_delete_operation');
  }
  if (deleteExists) {
    deleteIssues.push('delete_file_still_exists');
  }
  const deleteOrder = analyzeTranscriptOrder(planningLoop.transcript, sanitizeAgentVisibleText);
  const deleteScenario = {
    name: 'delete_file',
    route: 'project-file-flow',
    prompt: planningPrompt,
    planningToolCalls: planningLoop.toolCalls.map((toolCall) => ({
      name: toolCall.name,
      status: toolCall.status,
      input: toolCall.input,
      resultPreview: toolCall.resultPreview,
    })),
    planningFinalContent: planningLoop.finalContent,
    planStatus: parsedPlan.status,
    plannedOperations: parsedPlan.operations,
    proposalAssistantMessage: preparedDeleteFlow?.proposal.assistantMessage || null,
    proposalExecutionMessage: preparedDeleteFlow?.proposal.executionMessage || null,
    proposalDecision: preparedDeleteFlow?.decision || null,
    transcriptOrder: {
      firstToolResultIndex: deleteOrder.firstToolResultIndex,
      preToolVisibleMessages: deleteOrder.preToolMessages.map((entry) => entry.text),
      visibleAssistantMessages: deleteOrder.visibleAssistantMessages.map((entry) => entry.text),
    },
    execution: deleteExecution,
    verification: {
      ok: deleteIssues.length === 0,
      deletedPath: 'notes/remove-me.txt',
      stillExists: deleteExists,
    },
    issues: [...deleteOrder.issues, ...deleteIssues],
  };

  const report = {
    selectedConfigId: selected.id,
    provider: selected.provider,
    baseURL: selected.baseURL,
    model: selected.model,
    apiKeyPreview: maskApiKey(selected.apiKey),
    appOrigin: origin,
    userDataDir,
    sandboxRoot,
    scenarios: [readScenario, writeScenario, editScenario, deleteScenario],
  };

  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
