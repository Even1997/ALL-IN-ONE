// 文件作用：内置 runtime provider 适配器，负责请求官方 OpenAI / 兼容 OpenAI / Anthropic，并把原生流式结果归一到统一 provider 事件。
// 所在链路：provider protocol adapters -> canonical runtime events；这里只做协议选择、结构解析与事件投递，不改写模型语义。
// 排查入口：先看 streamRuntimeProviderTurn 的路由分支，再顺着对应的 streamOpenAIResponsesTurn / streamOpenAICompatibleTurn / streamAnthropicTurn 检查请求体、SSE 解析和 fallback。
import { withRetry } from '../../../src/modules/ai/runtime/retry/withRetry.ts';
import type { RuntimeToolPromptMessage } from '../../../src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts';
import { TOOLS } from '../../../src/modules/ai/runtime/tools/toolExecutor.ts';
import type {
  RuntimeProviderEvent,
  RuntimeProviderToolCall,
} from '../../../src/modules/ai/runtime/provider/runtimeProviderEvents.ts';
import type { RuntimeModelConfig } from '@goodnight/runtime-protocol';

type RuntimeProviderReadResult = {
  answer: string;
  thinking: string;
};

type RuntimeProviderPartialToolCall = {
  id?: string;
  name?: string;
  partialArguments: string;
};

type RuntimeProviderResponsesPartialToolCall = {
  itemId?: string;
  callId?: string;
  name?: string;
  partialArguments: string;
};

type RuntimeProviderStreamInput = {
  runtimeConfig: RuntimeModelConfig;
  prompt: string | RuntimeToolPromptMessage[];
  systemPrompt: string;
  onEvent?: (event: RuntimeProviderEvent) => Promise<void> | void;
  signal?: AbortSignal;
};

type RuntimeUsageSource = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
};

const normalizeBaseUrl = (baseURL: string) => baseURL.trim().replace(/\/+$/, '');

const shouldPreferOpenAIResponsesApi = (config: RuntimeModelConfig) =>
  config.provider === 'openai-compatible' && config.protocol === 'openai-responses';

const parseCustomHeaders = (customHeaders?: string) => {
  if (!customHeaders?.trim()) {
    return {};
  }

  try {
    const protectedHeaderNames = new Set(['authorization', 'content-type', 'x-api-key']);
    const parsed = JSON.parse(customHeaders) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key]) => !protectedHeaderNames.has(key.trim().toLowerCase()))
        .map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return {};
  }
};

const collectTextParts = (value: unknown): string => {
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
};

const buildTextEvents = (
  kind: Extract<RuntimeProviderEvent['kind'], 'thinking' | 'text'>,
  delta: string | null,
): RuntimeProviderEvent[] => (delta ? [{ kind, delta }] : []);

const normalizeUsage = (
  usage: RuntimeUsageSource | null | undefined,
): Extract<RuntimeProviderEvent, { kind: 'usage' }> | null => {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const inputTokens =
    typeof usage.input_tokens === 'number'
      ? usage.input_tokens
      : typeof usage.prompt_tokens === 'number'
        ? usage.prompt_tokens
        : null;
  const outputTokens =
    typeof usage.output_tokens === 'number'
      ? usage.output_tokens
      : typeof usage.completion_tokens === 'number'
        ? usage.completion_tokens
        : null;

  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  return {
    kind: 'usage',
    inputTokens,
    outputTokens,
    ...(typeof usage.total_tokens === 'number' ? { totalTokens: usage.total_tokens } : {}),
  };
};

// provider 这一层继续接受旧的 string prompt，也兼容 runtime 内部新的结构化消息数组。
const normalizePromptMessages = (
  prompt: string | RuntimeToolPromptMessage[],
): RuntimeToolPromptMessage[] =>
  typeof prompt === 'string'
    ? [{ role: 'user', content: prompt }]
    : prompt.filter((message) => message.content.trim().length > 0);

const parseToolArguments = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const buildRuntimeProviderToolCall = (input: {
  id?: string;
  name?: string;
  arguments: unknown;
  fallbackId: string;
}): RuntimeProviderToolCall | null => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const parsedArguments = parseToolArguments(input.arguments);
  if (!name || !parsedArguments) {
    return null;
  }

  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : input.fallbackId,
    name,
    input: parsedArguments,
  };
};

const buildOpenAIResponsesToolCallKey = (payload: any) => {
  const itemId =
    typeof payload?.item?.id === 'string' && payload.item.id.trim()
      ? payload.item.id.trim()
      : typeof payload?.item_id === 'string' && payload.item_id.trim()
        ? payload.item_id.trim()
        : '';
  if (itemId) {
    return `item:${itemId}`;
  }

  const callId =
    typeof payload?.item?.call_id === 'string' && payload.item.call_id.trim()
      ? payload.item.call_id.trim()
      : '';
  if (callId) {
    return `call:${callId}`;
  }

  if (typeof payload?.output_index === 'number') {
    return `index:${payload.output_index}`;
  }

  return 'response_call';
};

const finalizeOpenAIResponsesToolCall = (
  partial: RuntimeProviderResponsesPartialToolCall,
  emittedToolCallIds: Set<string>,
  responseToolCalls: Map<string, RuntimeProviderToolCall>,
) => {
  const parsed = buildRuntimeProviderToolCall({
    id: partial.callId || partial.itemId,
    name: partial.name,
    arguments: partial.partialArguments,
    fallbackId: partial.callId || partial.itemId || 'response_call',
  });
  if (!parsed) {
    return null;
  }

  responseToolCalls.set(parsed.id, parsed);
  if (emittedToolCallIds.has(parsed.id)) {
    return null;
  }

  emittedToolCallIds.add(parsed.id);
  return parsed;
};

const parseOpenAICompatibleToolCalls = (value: unknown): RuntimeProviderToolCall[] =>
  Array.isArray(value)
    ? value.flatMap((entry: any, index: number) => {
        const parsed = buildRuntimeProviderToolCall({
          id: entry?.id,
          name: entry?.function?.name,
          arguments: entry?.function?.arguments,
          fallbackId: `call_${index}`,
        });
        return parsed ? [parsed] : [];
      })
    : [];

const accumulateOpenAICompatibleToolCalls = (
  delta: any,
  toolBlocks: Map<number, RuntimeProviderPartialToolCall>,
): RuntimeProviderToolCall[] => {
  if (!Array.isArray(delta?.tool_calls)) {
    return [];
  }

  const completed: RuntimeProviderToolCall[] = [];
  delta.tool_calls.forEach((entry: any, index: number) => {
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
    const parsed = buildRuntimeProviderToolCall({
      id: block.id,
      name: block.name,
      arguments: block.partialArguments,
      fallbackId: `call_${blockIndex}`,
    });
    if (!parsed) {
      return;
    }

    completed.push(parsed);
    toolBlocks.delete(blockIndex);
  });

  return completed;
};

const extractOpenAICompatibleMessageText = (content: unknown) => {
  if (typeof content === 'string' && content.trim()) {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content.map((item: { text?: string }) => item?.text || '').join('\n').trim();
    if (text) {
      return text;
    }
  }

  return '';
};

const emitToolCallEvents = async (
  toolCalls: RuntimeProviderToolCall[],
  onEvent?: RuntimeProviderStreamInput['onEvent'],
) => {
  for (const toolCall of toolCalls) {
    await onEvent?.({
      kind: 'tool_call',
      toolCall,
    });
  }
};

const serializeToolCalls = (toolCalls: RuntimeProviderToolCall[]) =>
  JSON.stringify({
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.input),
      },
    })),
  });

const buildAssistantFallbackContent = (text: string, toolCalls: RuntimeProviderToolCall[]) => {
  const trimmedText = text.trim();
  if (toolCalls.length === 0) {
    return trimmedText;
  }

  const serializedToolCalls = serializeToolCalls(toolCalls);
  return trimmedText ? `${trimmedText}\n${serializedToolCalls}` : serializedToolCalls;
};

const parseAnthropicMessageToolCalls = (content: unknown): RuntimeProviderToolCall[] =>
  Array.isArray(content)
    ? content.flatMap((block: any, index: number) => {
        if (block?.type !== 'tool_use') {
          return [];
        }

        const structuredInput =
          block.input && typeof block.input === 'object' && !Array.isArray(block.input)
            ? (block.input as Record<string, unknown>)
            : {};
        if (typeof block.name !== 'string' || !block.name.trim()) {
          return [];
        }

        return [
          {
            id: typeof block.id === 'string' && block.id.trim() ? block.id : `call_${index}`,
            name: block.name.trim(),
            input: structuredInput,
          },
        ];
      })
    : [];

const buildAnthropicTools = () =>
  TOOLS.map((tool) => ({
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
        ]),
      ),
      required: tool.required,
    },
  }));

const buildOpenAIResponsesTools = () =>
  TOOLS.map((tool) => ({
    type: 'function' as const,
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
        ]),
      ),
      required: tool.required,
    },
  }));

const buildOpenAICompatibleTools = () =>
  TOOLS.map((tool) => ({
    type: 'function' as const,
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
          ]),
        ),
        required: tool.required,
      },
    },
  }));

const buildOpenAIResponsesInput = (
  systemPrompt: string,
  messages: RuntimeToolPromptMessage[],
) => [
  {
    role: 'system',
    content: systemPrompt,
  },
  ...messages.map((message) => ({
    role: message.role,
    content: message.content,
  })),
];

const buildOpenAIResponsesBody = (
  input: RuntimeProviderStreamInput,
  messages: RuntimeToolPromptMessage[],
) => ({
  model: input.runtimeConfig.model,
  temperature: 0.4,
  max_output_tokens: 4096,
  stream: true,
  reasoning: {
    summary: 'auto' as const,
  },
  tools: buildOpenAIResponsesTools(),
  input: buildOpenAIResponsesInput(input.systemPrompt, messages),
});

const readEventStream = async (
  body: ReadableStream<Uint8Array>,
  onEvent: RuntimeProviderStreamInput['onEvent'],
  parseEvents: (data: string) => RuntimeProviderEvent[],
): Promise<RuntimeProviderReadResult> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  let thinking = '';

  const emitEvents = async (events: RuntimeProviderEvent[]) => {
    for (const event of events) {
      if (event.kind === 'thinking') {
        thinking += event.delta;
      } else if (event.kind === 'text') {
        answer += event.delta;
      }

      await onEvent?.(event);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

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

      await emitEvents(parseEvents(dataLines.join('\n')));
    }
  }

  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail) {
    const dataLines = tail
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length > 0) {
      await emitEvents(parseEvents(dataLines.join('\n')));
    }
  }

  return { answer, thinking };
};

const isEventStreamResponse = (response: Response) =>
  (response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream');

const joinOpenAICompatibleUrl = (baseURL: string, path: string) =>
  `${normalizeBaseUrl(baseURL)}${path}`;

const buildOpenAICompatibleV1FallbackUrl = (baseURL: string, path: string) => {
  const normalized = normalizeBaseUrl(baseURL);
  if (/(^|\/)v\d+$/i.test(normalized)) {
    return joinOpenAICompatibleUrl(normalized, path);
  }

  return joinOpenAICompatibleUrl(`${normalized}/v1`, path);
};

const shouldRetryOpenAICompatibleWithV1 = (
  baseURL: string,
  attemptedUrl: string,
  response: Response,
  path: string,
) => {
  if (buildOpenAICompatibleV1FallbackUrl(baseURL, path) === attemptedUrl) {
    return false;
  }

  if (response.status === 404) {
    return true;
  }

  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
};

const fetchOpenAICompatibleWithV1Fallback = async (
  baseURL: string,
  path: string,
  init: RequestInit,
) => {
  const primaryUrl = joinOpenAICompatibleUrl(baseURL, path);
  const response = await fetch(primaryUrl, init);
  if (shouldRetryOpenAICompatibleWithV1(baseURL, primaryUrl, response, path)) {
    return fetch(buildOpenAICompatibleV1FallbackUrl(baseURL, path), init);
  }

  return response;
};

const parseOpenAIResponsesUsage = (payload: any) =>
  normalizeUsage(payload?.usage || payload?.response?.usage || payload?.item?.usage);

const parseOpenAIResponsesJsonPayload = (payload: any) => {
  const answerParts: string[] = [];
  const toolCalls: RuntimeProviderToolCall[] = [];

  // 中文导航：非 SSE 成功响应要走结构化 output 解析，避免把 responses 成功结果误判为空字符串。
  const output = Array.isArray(payload?.output) ? payload.output : [];
  output.forEach((item: any, index: number) => {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      const text = item.content
        .map((block: any) =>
          typeof block?.text === 'string' && (block.type === 'output_text' || block.type === 'text')
            ? block.text
            : '',
        )
        .join('');
      if (text) {
        answerParts.push(text);
      }
      return;
    }

    if (item?.type === 'function_call') {
      const parsed = buildRuntimeProviderToolCall({
        id: item.call_id || item.id,
        name: item.name,
        arguments: item.arguments,
        fallbackId: item.call_id || item.id || `response_call_${index}`,
      });
      if (parsed) {
        toolCalls.push(parsed);
      }
    }
  });

  return {
    answer: answerParts.join('\n').trim(),
    toolCalls,
  };
};

const parseOpenAIResponsesEvent = (
  payload: any,
  responseToolCallPartials: Map<string, RuntimeProviderResponsesPartialToolCall>,
  emittedToolCallIds: Set<string>,
  responseToolCalls: Map<string, RuntimeProviderToolCall>,
): RuntimeProviderEvent[] => {
  const usageEvent = parseOpenAIResponsesUsage(payload);
  const type = typeof payload?.type === 'string' ? payload.type : '';

  // 官方 Responses 流里 reasoning summary 和 output text 需要分别落到 thinking / text，保持下游语义不变。
  if (type === 'response.reasoning_summary_text.delta') {
    return [
      ...(usageEvent ? [usageEvent] : []),
      ...buildTextEvents('thinking', typeof payload?.delta === 'string' ? payload.delta : null),
    ];
  }

  if (type === 'response.output_text.delta') {
    return [
      ...(usageEvent ? [usageEvent] : []),
      ...buildTextEvents('text', typeof payload?.delta === 'string' ? payload.delta : null),
    ];
  }

  if (
    (type === 'response.output_item.added' || type === 'response.output_item.done') &&
    payload?.item?.type === 'function_call'
  ) {
    // 中文导航：Responses 会把同一 tool call 拆成 added / delta / done，多帧共享一个装配槽位后再决定是否发事件。
    const key = buildOpenAIResponsesToolCallKey(payload);
    const partial = responseToolCallPartials.get(key) || { partialArguments: '' };
    if (typeof payload.item.id === 'string' && payload.item.id.trim()) {
      partial.itemId = payload.item.id.trim();
    }
    if (typeof payload.item.call_id === 'string' && payload.item.call_id.trim()) {
      partial.callId = payload.item.call_id.trim();
    }
    if (typeof payload.item.name === 'string' && payload.item.name.trim()) {
      partial.name = payload.item.name.trim();
    }
    if (typeof payload.item.arguments === 'string') {
      partial.partialArguments = payload.item.arguments;
    }
    responseToolCallPartials.set(key, partial);

    const parsed = finalizeOpenAIResponsesToolCall(partial, emittedToolCallIds, responseToolCalls);
    if (!parsed) {
      return usageEvent ? [usageEvent] : [];
    }
    return [
      ...(usageEvent ? [usageEvent] : []),
      {
        kind: 'tool_call',
        toolCall: parsed,
      } satisfies RuntimeProviderEvent,
    ];
  }

  if (type === 'response.function_call_arguments.delta') {
    const key = buildOpenAIResponsesToolCallKey(payload);
    const partial = responseToolCallPartials.get(key) || { partialArguments: '' };
    if (typeof payload?.item_id === 'string' && payload.item_id.trim()) {
      partial.itemId = payload.item_id.trim();
    }
    if (typeof payload?.delta === 'string') {
      partial.partialArguments += payload.delta;
    }
    responseToolCallPartials.set(key, partial);
    return usageEvent ? [usageEvent] : [];
  }

  if (type === 'response.function_call_arguments.done') {
    const key = buildOpenAIResponsesToolCallKey(payload);
    const partial = responseToolCallPartials.get(key) || { partialArguments: '' };
    if (typeof payload?.item_id === 'string' && payload.item_id.trim()) {
      partial.itemId = payload.item_id.trim();
    }
    if (typeof payload?.arguments === 'string') {
      partial.partialArguments = payload.arguments;
    }
    responseToolCallPartials.set(key, partial);

    const parsed = finalizeOpenAIResponsesToolCall(partial, emittedToolCallIds, responseToolCalls);
    if (!parsed) {
      return usageEvent ? [usageEvent] : [];
    }

    return [
      ...(usageEvent ? [usageEvent] : []),
      {
        kind: 'tool_call',
        toolCall: parsed,
      } satisfies RuntimeProviderEvent,
    ];
  }

  return usageEvent ? [usageEvent] : [];
};

const streamOpenAIResponsesTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  const messages = normalizePromptMessages(input.prompt);
  const doFetch = async () => {
    const response = await fetchOpenAICompatibleWithV1Fallback(input.runtimeConfig.baseURL, '/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.runtimeConfig.apiKey}`,
        ...parseCustomHeaders(input.runtimeConfig.customHeaders),
      },
      body: JSON.stringify(buildOpenAIResponsesBody(input, messages)),
      signal: input.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI Responses API error (${response.status}): ${await response.text()}`);
    }

    const responseToolCallPartials = new Map<string, RuntimeProviderResponsesPartialToolCall>();
    const emittedToolCallIds = new Set<string>();
    const responseToolCalls = new Map<string, RuntimeProviderToolCall>();
    if (!response.body || !isEventStreamResponse(response)) {
      const payload = await response.json();
      const parsed = parseOpenAIResponsesJsonPayload(payload);
      parsed.toolCalls.forEach((toolCall) => {
        emittedToolCallIds.add(toolCall.id);
        responseToolCalls.set(toolCall.id, toolCall);
      });
      await emitToolCallEvents(parsed.toolCalls, input.onEvent);
      return input.onEvent
        ? parsed.answer
        : buildAssistantFallbackContent(parsed.answer, parsed.toolCalls);
    }

    const streamed = await readEventStream(response.body, input.onEvent, (data) => {
      const payload = JSON.parse(data);
      return parseOpenAIResponsesEvent(
        payload,
        responseToolCallPartials,
        emittedToolCallIds,
        responseToolCalls,
      );
    });

    const toolCalls = [...responseToolCalls.values()];
    return input.onEvent ? streamed.answer : buildAssistantFallbackContent(streamed.answer, toolCalls);
  };

  const finalText = await withRetry(doFetch, { signal: input.signal });
  await input.onEvent?.({
    kind: 'done',
    finalText,
  });
  return finalText;
};

const streamOpenAICompatibleTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  const messages = normalizePromptMessages(input.prompt);
  const doFetch = async () => {
    const response = await fetchOpenAICompatibleWithV1Fallback(input.runtimeConfig.baseURL, '/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.runtimeConfig.apiKey}`,
        ...parseCustomHeaders(input.runtimeConfig.customHeaders),
      },
      body: JSON.stringify({
        model: input.runtimeConfig.model,
        temperature: 0.4,
        max_tokens: 4096,
        stream: true,
        stream_options: {
          include_usage: true,
        },
        tools: buildOpenAICompatibleTools(),
        tool_choice: 'auto',
        messages: [
          {
            role: 'system',
            content: input.systemPrompt,
          },
          ...messages,
        ],
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible API error (${response.status}): ${await response.text()}`);
    }

    if (!response.body || !isEventStreamResponse(response)) {
      const payload = await response.json();
      const message = payload?.choices?.[0]?.message;
      const content = extractOpenAICompatibleMessageText(message?.content);
      const toolCalls = parseOpenAICompatibleToolCalls(message?.tool_calls);
      await emitToolCallEvents(toolCalls, input.onEvent);
      if (content || toolCalls.length > 0) {
        return input.onEvent ? content : buildAssistantFallbackContent(content, toolCalls);
      }
      throw new Error('OpenAI-compatible API returned empty content');
    }

    const streamedToolCalls: RuntimeProviderToolCall[] = [];
    const toolBlocks = new Map<number, RuntimeProviderPartialToolCall>();
    const streamed = await readEventStream(response.body, input.onEvent, (data) => {
      if (data === '[DONE]') {
        return [];
      }

      const payload = JSON.parse(data);
      const usageEvent = normalizeUsage(payload?.usage);
      const choice = payload?.choices?.[0];
      const delta = choice?.delta;
      const toolCalls = accumulateOpenAICompatibleToolCalls(delta, toolBlocks);

      if (toolCalls.length > 0) {
        streamedToolCalls.push(...toolCalls);
        return [
          ...(usageEvent ? [usageEvent] : []),
          ...toolCalls.map((toolCall) => ({
            kind: 'tool_call' as const,
            toolCall,
          })),
        ];
      }

      return [
        ...(usageEvent ? [usageEvent] : []),
        ...buildTextEvents(
          'thinking',
          [
            typeof delta?.reasoning === 'string' ? delta.reasoning : null,
            typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : null,
            collectTextParts(delta?.reasoning),
            collectTextParts(delta?.reasoning_content),
          ].find((value) => Boolean(value)) || null,
        ),
        ...buildTextEvents(
          'text',
          typeof delta?.content === 'string' ? delta.content : collectTextParts(delta?.content),
        ),
      ];
    });

    return input.onEvent ? streamed.answer : buildAssistantFallbackContent(streamed.answer, streamedToolCalls);
  };

  const finalText = await withRetry(doFetch, { signal: input.signal });
  await input.onEvent?.({
    kind: 'done',
    finalText,
  });
  return finalText;
};

const shouldFallbackFromResponsesToChat = (error: unknown) => {
  const message = String(error);
  if (/OpenAI Responses API error \(404\)/i.test(message)) {
    return true;
  }

  // 中文导航：只对“端点不存在/未实现”类错误降级，保留真实 400 请求错误给上层排查。
  return /OpenAI Responses API error \((400|405|501)\):.*(not found|unknown (url|path|endpoint)|unsupported|unavailable)/i.test(
    message,
  );
};

const streamAnthropicTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  const baseUrl = input.runtimeConfig.baseURL.trim() || 'https://api.anthropic.com/v1';
  const messages = normalizePromptMessages(input.prompt).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const doFetch = async () => {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': input.runtimeConfig.apiKey,
        'anthropic-version': '2023-06-01',
        ...parseCustomHeaders(input.runtimeConfig.customHeaders),
      },
      body: JSON.stringify({
        model: input.runtimeConfig.model,
        max_tokens: 4096,
        temperature: 0.4,
        system: input.systemPrompt,
        stream: true,
        tools: buildAnthropicTools(),
        messages,
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`);
    }

    if (!response.body || !isEventStreamResponse(response)) {
      const payload = await response.json();
      if (!Array.isArray(payload?.content)) {
        throw new Error('Anthropic API returned empty content');
      }

      const text = payload.content
        .filter((block: { type?: string }) => block?.type === 'text')
        .map((block: { text?: string }) => block?.text || '')
        .join('\n')
        .trim();
      const toolCalls = parseAnthropicMessageToolCalls(payload.content);
      await emitToolCallEvents(toolCalls, input.onEvent);
      if (text || toolCalls.length > 0) {
        return input.onEvent ? text : buildAssistantFallbackContent(text, toolCalls);
      }
      throw new Error('Anthropic API returned empty content');
    }

    const toolBlocks = new Map<
      number,
      { id: string; name: string; input?: Record<string, unknown>; partialJson: string }
    >();
    const streamedToolCalls: RuntimeProviderToolCall[] = [];
    const streamed = await readEventStream(response.body, input.onEvent, (data) => {
      const payload = JSON.parse(data);
      const type = payload?.type as string | undefined;
      const index = typeof payload?.index === 'number' ? payload.index : 0;
      const usageEvent = normalizeUsage(payload?.usage || payload?.message?.usage);
      const delta = payload?.delta;

      if (type === 'content_block_start') {
        const block = payload?.content_block;
        if (block?.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          const structuredInput =
            block.input && typeof block.input === 'object' && !Array.isArray(block.input)
              ? (block.input as Record<string, unknown>)
              : undefined;
          toolBlocks.set(index, {
            id: block.id,
            name: block.name,
            input: structuredInput && Object.keys(structuredInput).length > 0 ? structuredInput : undefined,
            partialJson: '',
          });
        }
      }

      if (type === 'content_block_delta') {
        const block = toolBlocks.get(index);
        if (block && delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          block.partialJson += delta.partial_json;
          return usageEvent ? [usageEvent] : [];
        }
      }

      if (type === 'content_block_stop') {
        const block = toolBlocks.get(index);
        if (!block) {
          return usageEvent ? [usageEvent] : [];
        }

        toolBlocks.delete(index);
        let structuredInput = block.input || {};
        if (!block.input && block.partialJson.trim()) {
          try {
            const parsed = JSON.parse(block.partialJson);
            structuredInput = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
          } catch {
            structuredInput = {};
          }
        }

        const toolCall = {
          id: block.id,
          name: block.name,
          input: structuredInput,
        } satisfies RuntimeProviderToolCall;
        streamedToolCalls.push(toolCall);
        return [
          ...(usageEvent ? [usageEvent] : []),
          {
            kind: 'tool_call',
            toolCall,
          } satisfies RuntimeProviderEvent,
        ];
      }

      return [
        ...(usageEvent ? [usageEvent] : []),
        ...(delta?.type === 'thinking_delta'
          ? buildTextEvents('thinking', typeof delta.thinking === 'string' ? delta.thinking : '')
          : []),
        ...(delta?.type === 'text_delta'
          ? buildTextEvents('text', typeof delta.text === 'string' ? delta.text : '')
          : []),
      ];
    });

    return input.onEvent ? streamed.answer : buildAssistantFallbackContent(streamed.answer, streamedToolCalls);
  };

  const finalText = await withRetry(doFetch, { signal: input.signal });
  await input.onEvent?.({
    kind: 'done',
    finalText,
  });
  return finalText;
};

export const streamRuntimeProviderTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  if (input.runtimeConfig.provider === 'anthropic') {
    return streamAnthropicTurn(input);
  }

  // 只有官方 OpenAI 走 Responses 优先；兼容供应商继续保持 chat/completions 语义不变。
  if (shouldPreferOpenAIResponsesApi(input.runtimeConfig)) {
    try {
      return await streamOpenAIResponsesTurn(input);
    } catch (error) {
      // 这里只允许受控降级，避免把真正的协议/鉴权错误静默吞掉。
      if (!shouldFallbackFromResponsesToChat(error)) {
        throw error;
      }
    }
  }

  return streamOpenAICompatibleTurn(input);
};
