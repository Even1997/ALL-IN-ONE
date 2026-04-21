import { ChangeScope, AIStreamChunk } from '../../../types';
import { v4 as uuidv4 } from 'uuid';
import { ToolExecutor, formatToolResult, parseToolCalls } from '../../../components/workspace/tools';

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

const DEFAULT_PROJECT_ROOT = '/Users/apple/Documents/all-in-one';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

class AIService {
  private config: AIConfig = {
    provider: 'openai-compatible',
    apiKey: '',
    baseURL: DEFAULT_BASE_URL,
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    temperature: 0.4,
    customHeaders: '',
    projectRoot: DEFAULT_PROJECT_ROOT,
  };

  private activeStreams: Map<string, AbortController> = new Map();
  private streamHandlers: Map<string, AIStreamHandler> = new Map();
  private toolExecutor = new ToolExecutor(DEFAULT_PROJECT_ROOT);

  setConfig(config: Partial<AIConfig>) {
    this.config = { ...this.config, ...config };
    this.toolExecutor.setProjectRoot(this.config.projectRoot);
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  async request(request: Omit<AIRequest, 'id'>, handler: AIStreamHandler): Promise<string> {
    const requestId = uuidv4();
    const fullRequest: AIRequest = { ...request, id: requestId };

    const abortController = new AbortController();
    this.activeStreams.set(requestId, abortController);
    this.streamHandlers.set(requestId, handler);

    handler.onStart();

    try {
      const systemPrompt = this.buildPrecisePrompt(fullRequest);

      if (!this.config.apiKey) {
        await this.simulateStream(requestId, systemPrompt, handler);
      } else {
        const content = await this.runAgentLoop(
          [{ role: 'user', content: fullRequest.prompt }],
          systemPrompt,
          abortController.signal,
          handler
        );

        handler.onComplete({
          requestId,
          status: 'completed',
          content,
          codeBlocks: this.extractCodeBlocks(content),
        });
      }
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

  async chat(
    prompt: string,
    handlers?: {
      onChunk?: (text: string) => void;
    }
  ): Promise<string> {
    if (!this.config.apiKey) {
      return `AI 未配置。请先在设置中填写第三方 API Key、Base URL 和模型。\n\n推荐配置：\n- Provider: openai-compatible\n- Base URL: ${DEFAULT_BASE_URL}\n- Model: 由第三方平台提供`;
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

    return content;
  }

  async testConnection(override?: Partial<AIConfig>): Promise<{ ok: boolean; message: string }> {
    const previous = this.getConfig();
    if (override) {
      this.setConfig(override);
    }

    try {
      const models = await this.listModels();
      const activeModel = models[0] || this.config.model;
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

  async listModels(override?: Partial<AIConfig>): Promise<string[]> {
    const previous = this.getConfig();
    if (override) {
      this.setConfig(override);
    }

    try {
      if (!this.config.apiKey) {
        return [this.config.model];
      }

      if (this.config.provider === 'anthropic') {
        return [this.config.model];
      }

      const url = this.joinUrl(this.config.baseURL || DEFAULT_BASE_URL, '/models');
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...this.parseCustomHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(`获取模型列表失败 (${response.status})`);
      }

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
    return `你是 DevFlow 中的 AI Coding Assistant。
你优先通过工具查看文件、搜索代码、执行命令，再给出精确建议。
所有文件路径都以 ${this.config.projectRoot} 为根目录。
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
    handler?: AIStreamHandler
  ): Promise<string> {
    const messages = [...inputMessages];
    let transcript = '';

    for (let round = 0; round < 4; round += 1) {
      const assistantText = await this.callProvider(messages, systemPrompt, signal);
      transcript += `${assistantText}\n`;
      this.emitChunkText(assistantText, handler);

      const toolCalls = parseToolCalls(assistantText);
      if (toolCalls.length === 0) {
        return transcript.trim();
      }

      const toolOutputs: string[] = [];
      for (const call of toolCalls) {
        const result = await this.toolExecutor.execute(call);
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

    return transcript.trim();
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

  private async callProvider(messages: ChatMessage[], systemPrompt: string, signal?: AbortSignal): Promise<string> {
    if (this.config.provider === 'anthropic') {
      return this.callAnthropic(messages, systemPrompt, signal);
    }

    return this.callOpenAICompatible(messages, systemPrompt, signal);
  }

  private async callOpenAICompatible(
    messages: ChatMessage[],
    systemPrompt: string,
    signal?: AbortSignal
  ): Promise<string> {
    const url = this.joinUrl(this.config.baseURL || DEFAULT_BASE_URL, '/chat/completions');
    const payload = {
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...this.parseCustomHeaders(),
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content.map((item) => item?.text || '').join('\n');
    }

    throw new Error('OpenAI-compatible API returned empty content');
  }

  private async callAnthropic(
    messages: ChatMessage[],
    systemPrompt: string,
    signal?: AbortSignal
  ): Promise<string> {
    const baseURL = this.config.baseURL || 'https://api.anthropic.com/v1';
    const url = this.joinUrl(baseURL, '/messages');
    const anthropicMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

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
        messages: anthropicMessages,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const json = await response.json();
    const blocks = json?.content;
    if (!Array.isArray(blocks)) {
      throw new Error('Anthropic API returned empty content');
    }

    return blocks.map((block) => block?.text || '').join('\n');
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
}

export const aiService = new AIService();
