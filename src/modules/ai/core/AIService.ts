// 文件作用：AI 服务入口，位于AI 接入核心层。
// 所在链路：负责模型调用、流式输出与底层 AI 协议接入。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type { ChangeScope, AIStreamChunk } from '../../../types/index.ts';
import type {
  RuntimeToolMessage,
  RuntimeToolPromptMessage,
} from '../runtime/agent-kernel/agentKernelTypes.ts';
// AIService 是旧有 AI 能力接入层的总入口之一。
// 它负责组织 provider 请求、流式输出、工具协议识别与部分执行辅助，是聊天能力的底层服务面。
// 如果你在排查“模型请求、流式返回、工具标记识别”为何异常，先看这里。
import { v4 as uuidv4 } from 'uuid';
import {
  ToolExecutor,
  TOOLS,
  containsToolProtocolMarkers,
  formatToolResult,
  parseToolCalls,
} from '../runtime/tools/toolExecutor.ts';
import { buildAIConfigurationError, hasUsableAIConfiguration, listModelsSupportMode } from './configStatus.ts';
import { withRetry } from '../runtime/retry/withRetry.ts';

// AIService 是旧版/通用 AI 调用入口：
// - 上层把“请求 + handler”交给它。
// - 它负责配置校验、system prompt、provider 调用、工具循环和流式回调。
// - 如果要排查“为什么模型回答了什么/为什么触发工具/为什么停止”，优先从这里看。
export type AIModule = 'feature-tree' | 'canvas' | 'code-editor' | 'backend' | 'bug-fix' | 'deploy';
export type AIAction = 'generate' | 'modify' | 'review' | 'fix' | 'explain' | 'optimize';
export type AIProviderType = 'openai-compatible' | 'anthropic';

export interface AIRequest {
  id: string;
  module: AIModule;
  action: AIAction;
  scope: ChangeScope;
  prompt: string;
  context?: {
    featureId?: string;
    featureName?: string;
    codeFiles?: string[];
    previewData?: unknown;
  };
  tokenBudget?: number;
}

export interface AIResponse {
  requestId: string;
  status: 'streaming' | 'completed' | 'error';
  content: string;
  codeBlocks: CodeBlock[];
  suggestions?: AISuggestion[];
  metadata?: Record<string, unknown>;
}

const TOOL_CALL_REPAIR_MESSAGE = [
  'Your last response appears to contain tool protocol markup, but it was not in a parseable format.',
  'If you want to call a tool, resend only the tool call using this exact XML format:',
  '<tool_use>',
  '<tool name="tool_name">',
  '<tool_params>{"key":"value"}</tool_params>',
  '</tool>',
  '</tool_use>',
  'Do not include DSML, tool_calls JSON, or any extra commentary before the tool call.',
  'If no tool is needed, answer the user directly.',
].join('\n');

export interface CodeBlock {
  language: string;
  code: string;
  filePath?: string;
  action: 'create' | 'update' | 'delete';
}

export interface AISuggestion {
  type: 'style' | 'logic' | 'performance' | 'security';
  message: string;
  location?: { file: string; line: number };
}

export interface AIStreamHandler {
  onStart: () => void;
  onChunk: (chunk: AIStreamChunk) => void;
  onComplete: (response: AIResponse) => void;
  onError: (error: string) => void;
  onInterrupt: () => void;
}

export interface AIConfig {
  provider: AIProviderType;
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowTokens: number;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
  customHeaders?: string;
  projectRoot: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type StructuredOpenAIMessage =
  | {
      role: 'system' | 'user' | 'assistant';
      content: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }
  | {
      role: 'tool';
      content: string;
      tool_call_id: string;
    };

type StructuredAnthropicMessage =
  | {
      role: 'user' | 'assistant';
      content:
        | string
        | Array<
            | {
                type: 'text';
                text: string;
              }
            | {
                type: 'tool_use';
                id: string;
                name: string;
                input: Record<string, unknown>;
              }
            | {
                type: 'tool_result';
                tool_use_id: string;
                content: string;
              }
          >;
    };

type RunAgentLoopOptions = {
  allowedTools?: string[];
};

type RunAgentLoopResult = {
  final: string;
  transcript: string;
};

export type AITextStreamEvent =
  | {
      kind: 'thinking' | 'text';
      delta: string;
      finishReason?: 'stop' | 'length' | 'tool_use' | 'content_filter';
    }
  | {
      kind: 'tool_call';
      delta: '';
      toolCall: {
        id: string;
        name: string;
        input: Record<string, unknown>;
      };
      finishReason?: 'stop' | 'length' | 'tool_use' | 'content_filter';
    };

type AITextStreamTextEventKind = Extract<AITextStreamEvent['kind'], 'thinking' | 'text'>;

const DEFAULT_PROJECT_ROOT = '.';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

type OpenAICompatiblePartialToolCall = {
  id?: string;
  name?: string;
  partialArguments: string;
};

// 这个类更偏“服务编排层”，不是单纯的 provider adapter。
// 它把 provider 输出、工具协议和前端 handler 串成一个完整回合。
class AIService {
  private config: AIConfig = {
    provider: 'openai-compatible',
    apiKey: '',
    baseURL: DEFAULT_BASE_URL,
    model: 'gpt-4o-mini',
    contextWindowTokens: 258000,
    maxTokens: 4096,
    temperature: 0.4,
    customHeaders: '',
    projectRoot: DEFAULT_PROJECT_ROOT,
  };

  private activeStreams: Map<string, AbortController> = new Map();
  private streamHandlers: Map<string, AIStreamHandler> = new Map();
  private toolExecutor = new ToolExecutor(DEFAULT_PROJECT_ROOT);

  setConfig(config: Partial<AIConfig>) {
    void this.simulateStream;
    this.config = { ...this.config, ...config };
    this.toolExecutor.setProjectRoot(this.config.projectRoot);
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  isConfigured() {
    return hasUsableAIConfiguration(this.config);
  }

  // `request` 是面向结构化业务请求的入口，常用于带 module/action/scope 的场景。
  async request(request: Omit<AIRequest, 'id'>, handler: AIStreamHandler): Promise<string> {
    const requestId = uuidv4();
    const fullRequest: AIRequest = { ...request, id: requestId };

    const abortController = new AbortController();
    this.activeStreams.set(requestId, abortController);
    this.streamHandlers.set(requestId, handler);

    handler.onStart();

    try {
      const systemPrompt = this.buildPrecisePrompt(fullRequest);

      if (!this.isConfigured()) {
        throw buildAIConfigurationError();
      }

      const content = await this.runAgentLoop(
        [{ role: 'user', content: fullRequest.prompt }],
        systemPrompt,
        abortController.signal,
        handler
      );

      handler.onComplete({
        requestId,
        status: 'completed',
        content: content.transcript,
        codeBlocks: this.extractCodeBlocks(content.transcript),
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        handler.onInterrupt();
      } else {
        handler.onError((error as Error).message);
      }
    } finally {
      this.activeStreams.delete(requestId);
      this.streamHandlers.delete(requestId);
    }

    return requestId;
  }

  // `chat` 是更轻量的纯对话入口，适合直接把 prompt 送进 agent loop。
  async chat(
    prompt: string,
    handlers?: {
      onChunk?: (text: string) => void;
    }
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw buildAIConfigurationError();
    }

    const content = await this.runAgentLoop(
      [{ role: 'user', content: prompt }],
      this.buildChatSystemPrompt(),
      undefined,
      handlers?.onChunk
        ? {
            onStart: () => undefined,
            onChunk: (chunk) => handlers.onChunk?.(chunk.content),
            onComplete: () => undefined,
            onError: () => undefined,
            onInterrupt: () => undefined,
          }
        : undefined
    );

    return content.transcript;
  }

  async chatWithTools(options: {
    prompt: string;
    systemPrompt: string;
    allowedTools: string[];
    onChunk?: (text: string) => void;
  }): Promise<string> {
    if (!this.isConfigured()) {
      throw buildAIConfigurationError();
    }

    const result = await this.runAgentLoop(
      [{ role: 'user', content: options.prompt }],
      options.systemPrompt,
      undefined,
      options.onChunk
        ? {
            onStart: () => undefined,
            onChunk: (chunk) => options.onChunk?.(chunk.content),
            onComplete: () => undefined,
            onError: () => undefined,
            onInterrupt: () => undefined,
          }
        : undefined,
      { allowedTools: options.allowedTools }
    );

    return result.final;
  }

  async completeText(options: {
    prompt: string;
    systemPrompt: string;
    onChunk?: (text: string) => void;
    onEvent?: (event: AITextStreamEvent) => void;
    signal?: AbortSignal;
  }): Promise<string> {
    const { prompt, systemPrompt, onChunk, onEvent, signal } = options;

    if (!this.isConfigured()) {
      throw buildAIConfigurationError();
    }

    if (!this.config.apiKey) {
      throw new Error('AI provider is not configured');
    }

    const content = await this.callProvider([{ role: 'user', content: prompt }], systemPrompt, signal, onEvent);
    if (onChunk && !onEvent) {
      this.emitChunkText(content, {
        onStart: () => undefined,
        onChunk: (chunk) => onChunk(chunk.content),
        onComplete: () => undefined,
        onError: () => undefined,
        onInterrupt: () => undefined,
      });
    }

    return content;
  }

  async completeMessages(options: {
    messages: RuntimeToolMessage[] | RuntimeToolPromptMessage[];
    systemPrompt: string;
    onChunk?: (text: string) => void;
    onEvent?: (event: AITextStreamEvent) => void;
    signal?: AbortSignal;
  }): Promise<string> {
    const { messages, systemPrompt, onChunk, onEvent, signal } = options;

    if (!this.isConfigured()) {
      throw buildAIConfigurationError();
    }

    if (!this.config.apiKey) {
      throw new Error('AI provider is not configured');
    }

    const content = await this.callProvider(messages, systemPrompt, signal, onEvent);
    if (onChunk && !onEvent) {
      this.emitChunkText(content, {
        onStart: () => undefined,
        onChunk: (chunk) => onChunk(chunk.content),
        onComplete: () => undefined,
        onError: () => undefined,
        onInterrupt: () => undefined,
      });
    }

    return content;
  }

  async testConnection(override?: Partial<AIConfig>): Promise<{ ok: boolean; message: string }> {
    const previous = this.getConfig();
    if (override) {
      this.setConfig(override);
    }

    try {
      if (!this.isConfigured()) {
        throw buildAIConfigurationError();
      }

      let activeModel = this.config.model;
      try {
        const models = await this.listModels();
        activeModel = models[0] || activeModel;
      } catch {
        await this.probeChatConnection();
      }

      return {
        ok: true,
        message: `连接成功，当前可用模型示例：${activeModel}`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (override) {
        this.setConfig(previous);
      }
    }
  }

  private async probeChatConnection(): Promise<void> {
    const probe = await this.callProvider(
      [{ role: 'user', content: 'Reply with OK.' }],
      'This is a connection test. Reply with OK only.'
    );

    if (!probe.trim()) {
      throw new Error('AI provider returned empty content during connection test');
    }
  }

  async listModels(override?: Partial<AIConfig>): Promise<string[]> {
    const previous = this.getConfig();
    if (override) {
      this.setConfig(override);
    }

    try {
      if (!this.isConfigured()) {
        throw buildAIConfigurationError();
      }

      if (!this.config.apiKey) {
        return [this.config.model];
      }

      if (listModelsSupportMode(this.config.provider) === 'preset-only') {
        return [this.config.model];
      }

      const response = await this.fetchOpenAICompatibleJson('/models');
      const json = await response.json();
      const models = Array.isArray(json?.data)
        ? json.data.map((item: { id?: string }) => item.id).filter(Boolean)
        : [];

      return models.length > 0 ? models : [this.config.model];
    } finally {
      if (override) {
        this.setConfig(previous);
      }
    }
  }

  interrupt(requestId: string) {
    const controller = this.activeStreams.get(requestId);
    if (controller) {
      controller.abort();
    }
  }

  interruptAll() {
    this.activeStreams.forEach((controller) => controller.abort());
  }

  private buildPrecisePrompt(request: AIRequest): string {
    const { module, action, scope, prompt, context } = request;

    let systemPrompt = `你是一个专业的软件开发助手，运行在可视化开发平台中。
当前模块: ${module}
当前操作: ${action}
工作目录: ${this.config.projectRoot}
`;

    if (context?.featureName) {
      systemPrompt += `\n当前功能: ${context.featureName}`;
    }

    systemPrompt += `\n\n## 变更范围\n`;
    systemPrompt += `文件: ${scope.target.filePath}\n`;
    systemPrompt += `类型: ${scope.target.type}\n`;
    systemPrompt += `ID: ${scope.target.id}\n`;

    if (scope.change.before) {
      systemPrompt += `\n当前代码:\n\`\`\`\n${scope.change.before}\n\`\`\`\n`;
    }

    if (scope.related.files.length > 0) {
      systemPrompt += `\n## 关联文件\n${scope.related.files.join(', ')}\n`;
    }

    systemPrompt += `\n## 用户需求\n${prompt}\n`;
    systemPrompt += this.buildToolInstructions();
    systemPrompt += `\n如果需要返回代码，请使用以下格式：
\`\`\`代码块:语言:文件路径:操作
你的代码
\`\`\`
`;

    return `${this.config.systemPrompt || ''}\n${systemPrompt}`.trim();
  }

  private buildChatSystemPrompt() {
    return `你是 GoodNight 中的 AI Coding Assistant。
你优先通过工具查看文件、搜索代码、执行命令，再给出精确建议。
所有文件路径都以 ${this.config.projectRoot} 为根目录。
除非用户明确指定了项目外的文件或目录，否则不要读取、搜索、修改当前项目根目录之外的任何内容。
${this.buildToolInstructions()}
如果你需要修改代码，请先给出原因，再输出代码块。`;
  }

  private buildToolInstructions() {
    return `

## 可用工具
- glob: 查找文件
- grep: 搜索内容
- ls: 列出目录
- view: 查看文件
- write: 写入文件
- edit: 精确替换文件内容
- bash: 执行命令
- fetch: 获取网页内容

## 文件边界
- 默认只允许在当前项目根目录内读取、搜索、写入、编辑文件。
- 如果用户没有明确点名项目外的绝对路径或外部目录，不要访问项目根目录之外的文件系统内容。
- 需要执行命令时，也默认以当前项目根目录作为工作目录，不要主动去项目外扫描文件。

如果你需要调用工具，请严格使用以下 XML 格式：
<tool_use>
<tool name="tool_name">
<tool_params>{"key":"value"}</tool_params>
</tool>
</tool_use>

拿到工具结果后，继续完成任务，不要停在工具调用本身。`;
  }

  private async simulateStream(
    requestId: string,
    prompt: string,
    handler: AIStreamHandler
  ): Promise<void> {
    const response = `当前未配置第三方 API Key，因此仍处于模拟模式。\n\n${prompt}\n\n\`\`\`代码块:typescript:src/generated/Example.ts:create\nexport const Example = () => {\n  return <div>Example</div>;\n};\n\`\`\``;

    const chunks = response.split(/(\s+)/);
    let content = '';

    for (const chunk of chunks) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      content += chunk;
      handler.onChunk({
        type: chunk.includes('```') ? 'code' : 'text',
        content: chunk,
        timestamp: Date.now(),
      });
    }

    handler.onComplete({
      requestId,
      status: 'completed',
      content,
      codeBlocks: this.extractCodeBlocks(content),
    });
  }

  private async runAgentLoop(
    inputMessages: ChatMessage[],
    systemPrompt: string,
    signal?: AbortSignal,
    handler?: AIStreamHandler,
    options?: RunAgentLoopOptions
  ): Promise<RunAgentLoopResult> {
    // 核心回合循环：
    // 1. 先向 provider 要一轮回答。
    // 2. 如果回答里带工具调用，就执行工具并把结果回灌给模型。
    // 3. 最多循环 4 轮，避免协议异常时无限递归。
    const messages = [...inputMessages];
    let transcript = '';
    let final = '';

    for (let round = 0; round < 4; round += 1) {
      const assistantText = await this.callProvider(messages, systemPrompt, signal);
      final = assistantText.trim() || final;
      transcript += `${assistantText}\n`;
      this.emitChunkText(assistantText, handler);

      const toolCalls = parseToolCalls(assistantText);
      if (toolCalls.length === 0) {
        if (containsToolProtocolMarkers(assistantText)) {
          messages.push({ role: 'assistant', content: assistantText });
          messages.push({
            role: 'user',
            content: TOOL_CALL_REPAIR_MESSAGE,
          });
          continue;
        }

        return { final, transcript: transcript.trim() };
      }

      const toolOutputs: string[] = [];
      for (const call of toolCalls) {
        const result =
          options?.allowedTools && !options.allowedTools.includes(call.name)
            ? {
                type: 'text' as const,
                content: `Tool ${call.name} is not allowed in this chat mode.`,
                is_error: true,
              }
            : await this.toolExecutor.execute(call);
        const formatted = formatToolResult(result);
        toolOutputs.push(`Tool ${call.name} result:\n${formatted}`);
        transcript += `\n${formatted}\n`;
        this.emitChunkText(`\n${formatted}\n`, handler, result.is_error ? 'error' : 'artifact');
      }

      messages.push({ role: 'assistant', content: assistantText });
      messages.push({
        role: 'user',
        content: `以下是工具执行结果，请继续完成原始任务：\n\n${toolOutputs.join('\n\n')}`,
      });
    }

    return { final, transcript: transcript.trim() };
  }

  private emitChunkText(text: string, handler?: AIStreamHandler, type: AIStreamChunk['type'] = 'text') {
    if (!handler) {
      return;
    }

    const chunks = text.split(/(\s+)/).filter(Boolean);
    chunks.forEach((chunk) =>
      handler.onChunk({
        type,
        content: chunk,
        timestamp: Date.now(),
      })
    );
  }

  private async callProvider(
    messages: ChatMessage[] | RuntimeToolMessage[],
    systemPrompt: string,
    signal?: AbortSignal,
    onEvent?: (event: AITextStreamEvent) => void
  ): Promise<string> {
    if (this.config.provider === 'anthropic') {
      return this.callAnthropic(messages, systemPrompt, signal, onEvent);
    }

    return this.callOpenAICompatible(messages, systemPrompt, signal, onEvent);
  }

  private async callOpenAICompatible(
    messages: ChatMessage[] | RuntimeToolMessage[],
    systemPrompt: string,
    signal?: AbortSignal,
    onEvent?: (event: AITextStreamEvent) => void
  ): Promise<string> {
    const payloadMessages = this.buildOpenAICompatibleMessages(messages, systemPrompt);
    const payload = {
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: Boolean(onEvent),
      tools: this.buildOpenAICompatibleTools(),
      tool_choice: 'auto',
      messages: payloadMessages,
    };

    const doFetch = async () => {
      const response = await this.fetchOpenAICompatibleJson('/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (onEvent && response.body) {
        return this.readOpenAICompatibleStream(response.body, onEvent);
      }

      const json = await response.json();
      const message = json?.choices?.[0]?.message;
      const content = message?.content;
      const finishReason = json?.choices?.[0]?.finish_reason;
      const toolCalls = this.parseOpenAICompatibleMessageToolCalls(message?.tool_calls);
      if (finishReason) {
        onEvent?.({ kind: 'text', delta: '', finishReason });
      }

      if (typeof content === 'string') {
        return this.buildOpenAICompatibleToolCallsFallbackContent(content, toolCalls);
      }

      if (Array.isArray(content)) {
        return this.buildOpenAICompatibleToolCallsFallbackContent(
          content.map((item) => item?.text || '').join('\n'),
          toolCalls
        );
      }

      if (toolCalls.length > 0) {
        return this.buildOpenAICompatibleToolCallsFallbackContent('', toolCalls);
      }

      throw new Error('OpenAI-compatible API returned empty content');
    };

    return withRetry(doFetch, { signal });
  }

  private async fetchOpenAICompatibleJson(path: string, init: RequestInit = {}) {
    const headers = {
      Authorization: `Bearer ${this.config.apiKey}`,
      ...this.parseCustomHeaders(),
      ...(init.headers || {}),
    };
    const requestInit: RequestInit = {
      ...init,
      headers,
    };

    const response = await this.fetchWithV1Fallback(path, requestInit);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText}`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const fallbackResponse = await this.fetchWithV1Fallback(path, requestInit, true);
      if (!fallbackResponse.ok) {
        const errorText = await fallbackResponse.text();
        throw new Error(`OpenAI-compatible API error (${fallbackResponse.status}): ${errorText}`);
      }
      return fallbackResponse;
    }

    return response;
  }

  private async fetchWithV1Fallback(path: string, init: RequestInit, forceV1 = false) {
    const baseURL = this.config.baseURL || DEFAULT_BASE_URL;
    const primaryUrl = this.joinUrl(baseURL, path);
    if (forceV1) {
      return fetch(this.buildV1FallbackUrl(baseURL, path), init);
    }

    try {
      const response = await fetch(primaryUrl, init);
      if (this.shouldRetryWithV1(baseURL, primaryUrl, response, path)) {
        return fetch(this.buildV1FallbackUrl(baseURL, path), init);
      }
      return response;
    } catch (error) {
      if (this.canRetryWithV1(baseURL, primaryUrl, path)) {
        return fetch(this.buildV1FallbackUrl(baseURL, path), init);
      }
      throw error;
    }
  }

  private shouldRetryWithV1(baseURL: string, attemptedUrl: string, response: Response, path: string) {
    if (!this.canRetryWithV1(baseURL, attemptedUrl, path)) {
      return false;
    }

    if (response.status === 404) {
      return true;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    return contentType.includes('text/html');
  }

  private canRetryWithV1(baseURL: string, attemptedUrl: string, path: string) {
    const fallbackUrl = this.buildV1FallbackUrl(baseURL, path);
    return fallbackUrl !== attemptedUrl;
  }

  private buildV1FallbackUrl(baseURL: string, path: string) {
    const normalized = baseURL.replace(/\/+$/, '');
    if (/(^|\/)v\d+$/i.test(normalized)) {
      return this.joinUrl(normalized, path);
    }

    return this.joinUrl(`${normalized}/v1`, path);
  }

  private async callAnthropic(
    messages: ChatMessage[] | RuntimeToolMessage[],
    systemPrompt: string,
    signal?: AbortSignal,
    onEvent?: (event: AITextStreamEvent) => void
  ): Promise<string> {
    const baseURL = this.config.baseURL || 'https://api.anthropic.com/v1';
    const url = this.joinUrl(baseURL, '/messages');
    const anthropicMessages = this.buildAnthropicMessages(messages);

    const doFetch = async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          ...this.parseCustomHeaders(),
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: systemPrompt,
          stream: Boolean(onEvent),
          messages: anthropicMessages,
          tools: this.buildAnthropicTools(),
        }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      if (onEvent && response.body) {
        return this.readAnthropicStream(response.body, onEvent);
      }

      const json = await response.json();
      const stopReason = json?.stop_reason as string | undefined;
      if (stopReason && stopReason !== 'end_turn') {
        onEvent?.({ kind: 'text', delta: '', finishReason: stopReason as AITextStreamEvent['finishReason'] });
      }

      const blocks = json?.content;
      if (!Array.isArray(blocks)) {
        throw new Error('Anthropic API returned empty content');
      }

      return blocks.map((block) => block?.text || '').join('\n');
    };

    return withRetry(doFetch, { signal });
  }

  private parseCustomHeaders(): Record<string, string> {
    if (!this.config.customHeaders?.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(this.config.customHeaders);
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)])
      );
    } catch {
      return {};
    }
  }

  private buildAnthropicTools(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([name, parameter]) => [
            name,
            {
              type: parameter.type,
              description: parameter.description,
              ...(parameter.items ? { items: parameter.items } : {}),
            },
          ])
        ),
        required: tool.required,
      },
    }));
  }

  private buildOpenAICompatibleMessages(
    messages: ChatMessage[] | RuntimeToolMessage[] | RuntimeToolPromptMessage[],
    systemPrompt: string,
  ): StructuredOpenAIMessage[] {
    const normalizedMessages = this.normalizeProviderMessages(messages);
    return [
      { role: 'system', content: systemPrompt },
      ...normalizedMessages.map((message) => {
        if (message.kind === 'assistant_tool_call') {
          return {
            role: 'assistant' as const,
            content: message.content,
            tool_calls: [
              {
                id: message.toolCallId,
                type: 'function' as const,
                function: {
                  name: message.toolName,
                  arguments: JSON.stringify(message.input),
                },
              },
            ],
          };
        }

        if (message.kind === 'tool_result') {
          return {
            role: 'tool' as const,
            content: message.content,
            tool_call_id: message.toolCallId,
          };
        }

        return {
          role: message.role,
          content: message.content,
        };
      }),
    ];
  }

  private buildAnthropicMessages(
    messages: ChatMessage[] | RuntimeToolMessage[] | RuntimeToolPromptMessage[]
  ): StructuredAnthropicMessage[] {
    const normalized = this.normalizeProviderMessages(messages);
    const result: StructuredAnthropicMessage[] = [];

    for (const message of normalized) {
      if (message.kind === 'assistant_tool_call') {
        // Anthropic 原生工具协议要求 assistant 用 tool_use block 挂出调用事实。
        result.push({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: message.toolCallId,
              name: message.toolName,
              input: message.input,
            },
          ],
        });
        continue;
      }

      if (message.kind === 'tool_result') {
        // tool_result 不是独立 role，而是下一条 user message 的 content block。
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content: message.content,
            },
          ],
        });
        continue;
      }

      result.push({
        role: message.role,
        content: message.content,
      });
    }

    return result;
  }

  private normalizeProviderMessages(
    messages: ChatMessage[] | RuntimeToolMessage[] | RuntimeToolPromptMessage[],
  ): RuntimeToolMessage[] {
    return messages.map((message) => {
      if ('kind' in message) {
        return message;
      }

      if ('role' in message && (message.role === 'user' || message.role === 'assistant')) {
        return message.role === 'user'
          ? {
              kind: 'user' as const,
              role: 'user' as const,
              content: message.content,
            }
          : {
              kind: 'assistant_text' as const,
              role: 'assistant' as const,
              content: message.content,
            };
      }

      return message.role === 'user'
        ? {
            kind: 'user' as const,
            role: 'user' as const,
            content: message.content,
          }
        : {
            kind: 'assistant_text' as const,
            role: 'assistant' as const,
            content: message.content,
          };
    });
  }

  private buildOpenAICompatibleTools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return TOOLS.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([name, parameter]) => [
              name,
              {
                type: parameter.type,
                description: parameter.description,
                ...(parameter.items ? { items: parameter.items } : {}),
              },
            ])
          ),
          required: tool.required,
        },
      },
    }));
  }

  private joinUrl(baseURL: string, path: string) {
    if (baseURL.endsWith(path)) {
      return baseURL;
    }

    return `${baseURL.replace(/\/+$/, '')}${path}`;
  }

  private extractCodeBlocks(content: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const regex = /```代码块:(\w+):([^:]+):(\w+)\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        language: match[1],
        code: match[4].trim(),
        filePath: match[2],
        action: match[3] as 'create' | 'update' | 'delete',
      });
    }

    return blocks;
  }

  private async readOpenAICompatibleStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: AITextStreamEvent) => void
  ): Promise<string> {
    const toolBlocks = new Map<number, OpenAICompatiblePartialToolCall>();
    const text = await this.readEventStream(body, onEvent, (data) => {
      if (data === '[DONE]') {
        return [];
      }

      const json = JSON.parse(data);
      const choice = json?.choices?.[0];
      const delta = choice?.delta;
      const finishReason = choice?.finish_reason as string | undefined;

      if (finishReason) {
        onEvent({ kind: 'text', delta: '', finishReason: finishReason as AITextStreamEvent['finishReason'] });
      }

      if (!delta) {
        return [];
      }

      const toolCalls = this.accumulateOpenAICompatibleToolCalls(delta, toolBlocks);
      if (toolCalls.length > 0) {
        return toolCalls;
      }

      return [
        ...this.collectOpenAIReasoningEvents(delta),
        ...this.buildEventList('text', this.collectOpenAITextDelta(delta)),
      ];
    });

    return text.answer;
  }

  private accumulateOpenAICompatibleToolCalls(
    delta: Record<string, unknown>,
    toolBlocks: Map<number, OpenAICompatiblePartialToolCall>
  ): AITextStreamEvent[] {
    const toolCalls = (delta as { tool_calls?: unknown }).tool_calls;
    if (!Array.isArray(toolCalls)) {
      return [];
    }

    const completed: AITextStreamEvent[] = [];
    toolCalls.forEach((entry: any, index: number) => {
      const blockIndex = typeof entry?.index === 'number' ? entry.index : index;
      const block = toolBlocks.get(blockIndex) || { partialArguments: '' };

      if (typeof entry?.id === 'string' && entry.id.trim()) {
        block.id = entry.id.trim();
      }
      if (typeof entry?.function?.name === 'string' && entry.function.name.trim()) {
        block.name = entry.function.name.trim();
      }
      if (typeof entry?.function?.arguments === 'string') {
        block.partialArguments += entry.function.arguments;
      }

      toolBlocks.set(blockIndex, block);
      const parsed = this.buildOpenAICompatibleToolCall(block, `call_${blockIndex}`);
      if (!parsed) {
        return;
      }

      completed.push({
        kind: 'tool_call',
        delta: '',
        toolCall: parsed,
      });
      toolBlocks.delete(blockIndex);
    });

    return completed;
  }

  private buildOpenAICompatibleToolCall(
    block: OpenAICompatiblePartialToolCall,
    fallbackId: string
  ): Extract<AITextStreamEvent, { kind: 'tool_call' }>['toolCall'] | null {
    const name = typeof block.name === 'string' ? block.name.trim() : '';
    if (!name) {
      return null;
    }

    try {
      const parsed = JSON.parse(block.partialArguments);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      return {
        id: typeof block.id === 'string' && block.id.trim() ? block.id.trim() : fallbackId,
        name,
        input: parsed as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  private parseOpenAICompatibleMessageToolCalls(
    value: unknown
  ): Array<Extract<AITextStreamEvent, { kind: 'tool_call' }>['toolCall']> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry: any, index: number) => {
      const rawArguments = entry?.function?.arguments;
      const partialArguments =
        typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {});
      const parsed = this.buildOpenAICompatibleToolCall(
        {
          id: typeof entry?.id === 'string' ? entry.id : undefined,
          name: typeof entry?.function?.name === 'string' ? entry.function.name : undefined,
          partialArguments,
        },
        `call_${index}`
      );
      return parsed ? [parsed] : [];
    });
  }

  private buildOpenAICompatibleToolCallsFallbackContent(
    content: string,
    toolCalls: Array<Extract<AITextStreamEvent, { kind: 'tool_call' }>['toolCall']>
  ) {
    if (toolCalls.length === 0) {
      return content;
    }

    const serializedToolCalls = JSON.stringify({
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.input),
        },
      })),
    });
    const trimmedContent = content.trim();
    return trimmedContent ? `${trimmedContent}\n${serializedToolCalls}` : serializedToolCalls;
  }

  private collectOpenAIReasoningEvents(delta: Record<string, unknown>): AITextStreamEvent[] {
    const reasoningCandidates = [
      typeof delta.reasoning === 'string' ? delta.reasoning : null,
      typeof delta.reasoning_content === 'string' ? delta.reasoning_content : null,
      this.collectTextParts(delta.reasoning),
      this.collectTextParts(delta.reasoning_content),
    ];

    return reasoningCandidates.flatMap((candidate) => this.buildEventList('thinking', candidate));
  }

  private collectOpenAITextDelta(delta: Record<string, unknown>) {
    if (typeof delta.content === 'string') {
      return delta.content;
    }

    return this.collectTextParts(delta.content);
  }

  private async readAnthropicStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: AITextStreamEvent) => void
  ): Promise<string> {
    const toolBlocks = new Map<
      number,
      { id: string; name: string; input?: Record<string, unknown>; partialJson: string }
    >();

    const text = await this.readEventStream(body, onEvent, (data) => {
      const json = JSON.parse(data);
      const type = json?.type as string | undefined;
      const index = typeof json?.index === 'number' ? json.index : 0;

      // message_delta carries stop_reason
      if (type === 'message_delta') {
        const stopReason = json?.delta?.stop_reason as string | undefined;
        if (stopReason && stopReason !== 'end_turn') {
          onEvent({ kind: 'text', delta: '', finishReason: stopReason as AITextStreamEvent['finishReason'] });
        }
        return [];
      }

      if (type === 'content_block_start') {
        const block = json?.content_block;
        if (block?.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          const input =
            block.input && typeof block.input === 'object' && !Array.isArray(block.input)
              ? (block.input as Record<string, unknown>)
              : undefined;
          toolBlocks.set(index, {
            id: block.id,
            name: block.name,
            input: input && Object.keys(input).length > 0 ? input : undefined,
            partialJson: '',
          });
        }
        return [];
      }

      const delta = json?.delta;
      if (type === 'content_block_delta') {
        const block = toolBlocks.get(index);
        if (block && delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          block.partialJson += delta.partial_json;
          return [];
        }
      }

      if (type === 'content_block_stop') {
        const block = toolBlocks.get(index);
        if (!block) {
          return [];
        }
        toolBlocks.delete(index);

        let input = block.input || {};
        if (!block.input && block.partialJson.trim()) {
          try {
            const parsed = JSON.parse(block.partialJson);
            input = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
          } catch {
            input = {};
          }
        }

        return [
          {
            kind: 'tool_call',
            delta: '',
            toolCall: {
              id: block.id,
              name: block.name,
              input,
            },
          },
        ];
      }

      if (!delta || typeof delta !== 'object') {
        return [];
      }

      if (delta.type === 'thinking_delta') {
        return this.buildEventList('thinking', typeof delta.thinking === 'string' ? delta.thinking : '');
      }

      if (delta.type === 'text_delta') {
        return this.buildEventList('text', typeof delta.text === 'string' ? delta.text : '');
      }

      return [];
    });

    return text.answer;
  }

  private async readEventStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: AITextStreamEvent) => void,
    parseEvents: (data: string) => AITextStreamEvent[]
  ): Promise<{ answer: string; thinking: string }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const IDLE_TIMEOUT_MS = 90000;
    const STALL_LOG_MS = 30000;
    let buffer = '';
    let answer = '';
    let thinking = '';
    let lastEventTime = Date.now();
    let idleTimer: ReturnType<typeof setInterval> | null = null;

    const createIdleTimer = () =>
      new Promise<never>((_, reject) => {
        idleTimer = setInterval(() => {
          const elapsed = Date.now() - lastEventTime;
          if (elapsed >= IDLE_TIMEOUT_MS) {
            if (idleTimer) {
              clearInterval(idleTimer);
              idleTimer = null;
            }
            reject(new Error(`SSE stream idle timeout after ${Math.round(elapsed / 1000)}s`));
          }
        }, 5000);
      });

    let timedOut = false;
    const idlePromise = createIdleTimer();

    const readLoop = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const now = Date.now();
        if (now - lastEventTime > STALL_LOG_MS) {
          console.warn(`[AIService] SSE stall: ${Math.round((now - lastEventTime) / 1000)}s since last event`);
        }
        lastEventTime = now;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          const dataLines = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart());
          if (dataLines.length === 0) {
            continue;
          }

          const events = parseEvents(dataLines.join('\n'));
          events.forEach((event) => {
            if (event.kind === 'thinking') {
              thinking += event.delta;
            } else if (event.kind === 'text') {
              answer += event.delta;
            }
            this.emitStreamEvent(onEvent, event);
          });
        }
      }
    };

    try {
      await Promise.race([readLoop(), idlePromise]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('idle timeout')) {
        timedOut = true;
        try { reader.cancel(); } catch { /* ignore */ }
        throw error;
      }
      throw error;
    } finally {
      if (idleTimer) {
        clearInterval(idleTimer);
        idleTimer = null;
      }
    }

    if (!timedOut) {
      buffer += decoder.decode();
      const tail = buffer.trim();
      if (tail) {
        const dataLines = tail
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart());
        if (dataLines.length > 0) {
          const events = parseEvents(dataLines.join('\n'));
          events.forEach((event) => {
            if (event.kind === 'thinking') {
              thinking += event.delta;
            } else if (event.kind === 'text') {
              answer += event.delta;
            }
            this.emitStreamEvent(onEvent, event);
          });
        }
      }
    }

    return { answer, thinking };
  }

  private collectTextParts(value: unknown): string {
    if (!Array.isArray(value)) {
      return '';
    }

    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          if (typeof (item as { text?: unknown }).text === 'string') {
            return (item as { text: string }).text;
          }
          if (typeof (item as { content?: unknown }).content === 'string') {
            return (item as { content: string }).content;
          }
        }
        return '';
      })
      .join('');
  }

  private emitStreamEvent(onEvent: (event: AITextStreamEvent) => void, event: AITextStreamEvent) {
    if (event.kind !== 'tool_call' && !event.delta && !event.finishReason) {
      return;
    }

    onEvent(event);
  }

  private buildEventList(kind: AITextStreamTextEventKind, delta: string | null): AITextStreamEvent[] {
    return delta ? [{ kind, delta }] : [];
  }
}

export const aiService = new AIService();
