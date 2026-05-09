import { convertFileSrc } from '@tauri-apps/api/core';
import { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIChatMessagePart } from './aiChatMessageParts';

export type AIChatMessagePartRenderOptions = {
  isStreaming: boolean;
  thinkingExpanded?: boolean;
  onToggleThinking?: () => void;
};

const MIN_VALID_EPOCH_SECONDS = 946684800;
const MIN_VALID_EPOCH_MILLISECONDS = MIN_VALID_EPOCH_SECONDS * 1000;
const MAX_REASONABLE_ELAPSED_SECONDS = 60 * 60 * 24 * 365;

const normalizeEpochMilliseconds = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value >= MIN_VALID_EPOCH_MILLISECONDS) {
    return value;
  }

  if (value >= MIN_VALID_EPOCH_SECONDS) {
    return value * 1000;
  }

  return null;
};

const normalizeThinkingElapsedSeconds = (elapsedSeconds: number | undefined) => {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds)) {
    return undefined;
  }

  if (elapsedSeconds > MAX_REASONABLE_ELAPSED_SECONDS) {
    return undefined;
  }

  return Math.max(0.1, elapsedSeconds);
};

const formatThinkingDuration = (elapsedSeconds: number) => `${Math.max(0.1, elapsedSeconds).toFixed(1)}s`;
const getLiveThinkingElapsedSeconds = (startedAt: number, referenceTime: number) => {
  const normalizedStartedAt = normalizeEpochMilliseconds(startedAt);
  const normalizedReferenceTime = normalizeEpochMilliseconds(referenceTime);
  if (normalizedStartedAt === null || normalizedReferenceTime === null) {
    return undefined;
  }

  return Math.max(0.1, Math.round(Math.max(0, normalizedReferenceTime - normalizedStartedAt) / 100) / 10);
};
const resolveDisplayThinkingElapsedSeconds = (
  elapsedSeconds: number | undefined,
  lastDisplayedElapsedSeconds: number | null
) => {
  const normalizedElapsedSeconds = normalizeThinkingElapsedSeconds(elapsedSeconds);
  if (typeof normalizedElapsedSeconds !== 'number') {
    return lastDisplayedElapsedSeconds ?? undefined;
  }

  return Math.max(normalizedElapsedSeconds, lastDisplayedElapsedSeconds ?? normalizedElapsedSeconds);
};

export const AssistantThinkingBlock = memo(function AssistantThinkingBlock({
  part,
  isStreaming,
  thinkingExpanded,
  onToggleThinking,
}: {
  part: Extract<AIChatMessagePart, { type: 'thinking' }>;
  isStreaming: boolean;
  thinkingExpanded?: boolean;
  onToggleThinking?: () => void;
}) {
  const isExpanded = thinkingExpanded ?? !part.collapsed;
  const isThinkingActive = part.status === 'streaming' || (isStreaming && part.status !== 'completed');
  const [referenceTime, setReferenceTime] = useState(() => Date.now());
  const lastDisplayedElapsedSecondsRef = useRef<number | null>(null);
  useEffect(() => {
    lastDisplayedElapsedSecondsRef.current =
      normalizeThinkingElapsedSeconds(part.elapsedSeconds) ?? null;
  }, [part.createdAt]);
  useEffect(() => {
    if (!isThinkingActive || typeof part.createdAt !== 'number') {
      return;
    }

    setReferenceTime(Date.now());
    const timer = window.setInterval(() => setReferenceTime(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [isThinkingActive, part.createdAt]);

  const rawDisplayedElapsedSeconds =
    isThinkingActive && typeof part.createdAt === 'number'
      ? getLiveThinkingElapsedSeconds(part.createdAt, referenceTime)
      : part.elapsedSeconds;
  const displayedElapsedSeconds = resolveDisplayThinkingElapsedSeconds(
    rawDisplayedElapsedSeconds,
    lastDisplayedElapsedSecondsRef.current
  );
  useEffect(() => {
    if (typeof displayedElapsedSeconds !== 'number') {
      return;
    }

    lastDisplayedElapsedSecondsRef.current = Math.max(
      lastDisplayedElapsedSecondsRef.current ?? displayedElapsedSeconds,
      displayedElapsedSeconds
    );
  }, [displayedElapsedSeconds]);
  const durationLabel =
    typeof displayedElapsedSeconds === 'number' ? formatThinkingDuration(displayedElapsedSeconds) : '';
  const previewLine =
    part.content
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .find(Boolean) || '';
  const summaryLabel = isThinkingActive ? '\u601d\u8003\u4e2d' : '\u601d\u8003\u8fc7\u7a0b';
  const summaryPreview = !isExpanded
    ? previewLine || (isThinkingActive ? '\u6b63\u5728\u5b9e\u65f6\u66f4\u65b0\u63a8\u7406\u5185\u5bb9' : '')
    : '';

  return (
    <div className={`chat-thinking-block ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        type="button"
        className="chat-thinking-toggle"
        onClick={onToggleThinking}
        disabled={!onToggleThinking}
        aria-expanded={isExpanded}
      >
        <span className="chat-thinking-pulse" aria-hidden="true" />
        <span className="chat-thinking-copy">
          <strong>
            {summaryLabel}
            {durationLabel ? ` ${durationLabel}` : ''}
          </strong>
          {summaryPreview ? <span className="chat-thinking-preview">{summaryPreview}</span> : null}
        </span>
        {isThinkingActive ? (
          <span className="chat-thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : null}
        <span className="chat-thinking-toggle-caret" aria-hidden="true" />
      </button>
      <div className="chat-thinking-block-content">
        <div>
          {part.content ? (
            <pre>{part.content}</pre>
          ) : (
            <div className="chat-thinking-empty">{'\u7b49\u5f85\u6a21\u578b\u8f93\u51fa\u601d\u8003\u5185\u5bb9...'}</div>
          )}
        </div>
      </div>
    </div>
  );
});

export const AssistantTextBlock = memo(function AssistantTextBlock({
  content,
}: {
  content: string;
}) {
  const inlineImagePaths = extractInlineImagePaths(content);

  return (
    <div className={`chat-answer-text ${shouldUseAssistantDocumentLayout(content) ? 'document' : 'bubble'}`}>
      <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
      {inlineImagePaths.length > 0 ? (
        <div className="chat-inline-image-gallery">
          {inlineImagePaths.map((imagePath) => {
            const imageName = imagePath.replace(/\\/g, '/').split('/').pop() || imagePath;
            return (
              <a
                key={imagePath}
                className="chat-inline-image-card"
                href={convertFileSrc(imagePath)}
                target="_blank"
                rel="noreferrer"
                title={imagePath}
              >
                <img src={convertFileSrc(imagePath)} alt={imageName} loading="lazy" />
                <span>{imageName}</span>
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

const MARKDOWN_COMPONENTS: Components = {
  table: ({ node, children, ...props }) => {
    void node;
    return (
      <div className="chat-answer-table-scroll">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

const shouldUseAssistantDocumentLayout = (content: string) => {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }

  if (/```/.test(normalized)) {
    return true;
  }

  if (/^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|\|.+\|)/m.test(normalized)) {
    return true;
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return paragraphs.length >= 2 || normalized.split('\n').filter((line) => line.trim()).length >= 8;
};

const IMAGE_PATH_PATTERN = /(?:^|[\s`"'(])((?:[A-Za-z]:[\\/]|\/)[^\s`"')<>]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif|ico))/gim;

const extractInlineImagePaths = (content: string) => {
  const paths: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = IMAGE_PATH_PATTERN.exec(content)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    paths.push(candidate);
  }

  return paths;
};
