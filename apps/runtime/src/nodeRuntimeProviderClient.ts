import { withRetry } from '../../../src/modules/ai/runtime/retry/withRetry.ts';
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

type RuntimeProviderStreamInput = {
  runtimeConfig: RuntimeModelConfig;
  prompt: string;
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

const parseOpenAICompatibleToolCall = (delta: any): RuntimeProviderToolCall[] =>
  Array.isArray(delta?.tool_calls)
    ? delta.tool_calls.flatMap((entry: any) => {
        const name = entry?.function?.name;
        const args = entry?.function?.arguments;
        if (typeof name !== 'string' || typeof args !== 'string') {
          return [];
        }

        try {
          const parsed = JSON.parse(args);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return [];
          }

          return [
            {
              id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id : `call_${Date.now()}`,
              name,
              input: parsed,
            },
          ];
        } catch {
          return [];
        }
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

const readEventStream = async (
  body: ReadableStream<Uint8Array>,
  onEvent: NonNullable<RuntimeProviderStreamInput['onEvent']>,
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

      await onEvent(event);
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

const streamOpenAICompatibleTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  const doFetch = async () => {
    const response = await fetch(`${input.runtimeConfig.baseURL.replace(/\/$/, '')}/chat/completions`, {
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
        messages: [
          {
            role: 'system',
            content: input.systemPrompt,
          },
          {
            role: 'user',
            content: input.prompt,
          },
        ],
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI-compatible API error (${response.status}): ${await response.text()}`);
    }

    if (!response.body || !input.onEvent || !isEventStreamResponse(response)) {
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return content;
      }
      if (Array.isArray(content)) {
        const text = content.map((item: { text?: string }) => item?.text || '').join('\n').trim();
        if (text) {
          return text;
        }
      }
      throw new Error('OpenAI-compatible API returned empty content');
    }

    const streamed = await readEventStream(response.body, input.onEvent, (data) => {
      if (data === '[DONE]') {
        return [];
      }

      const payload = JSON.parse(data);
      const usageEvent = normalizeUsage(payload?.usage);
      const choice = payload?.choices?.[0];
      const delta = choice?.delta;
      const toolCalls = parseOpenAICompatibleToolCall(delta);

      if (toolCalls.length > 0) {
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

    return streamed.answer;
  };

  const finalText = await withRetry(doFetch, { signal: input.signal });
  await input.onEvent?.({
    kind: 'done',
    finalText,
  });
  return finalText;
};

const streamAnthropicTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  const baseUrl = input.runtimeConfig.baseURL.trim() || 'https://api.anthropic.com/v1';
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
        messages: [
          {
            role: 'user',
            content: input.prompt,
          },
        ],
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`);
    }

    if (!response.body || !input.onEvent || !isEventStreamResponse(response)) {
      const payload = await response.json();
      if (!Array.isArray(payload?.content)) {
        throw new Error('Anthropic API returned empty content');
      }

      const text = payload.content.map((block: { text?: string }) => block?.text || '').join('\n').trim();
      if (!text) {
        throw new Error('Anthropic API returned empty content');
      }

      return text;
    }

    const toolBlocks = new Map<
      number,
      { id: string; name: string; input?: Record<string, unknown>; partialJson: string }
    >();
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

        return [
          ...(usageEvent ? [usageEvent] : []),
          {
            kind: 'tool_call',
            toolCall: {
              id: block.id,
              name: block.name,
              input: structuredInput,
            },
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

    return streamed.answer;
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

  return streamOpenAICompatibleTurn(input);
};
