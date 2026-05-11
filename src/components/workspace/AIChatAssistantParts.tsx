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

const formatThinkingDuration = (elapsedSeconds: number) => {
  const wholeSeconds = Math.floor(Math.max(0, elapsedSeconds));
  return `${wholeSeconds}秒`;
};

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
  lastDisplayedElapsedSeconds: number | null,
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
    lastDisplayedElapsedSecondsRef.current = normalizeThinkingElapsedSeconds(part.elapsedSeconds) ?? null;
  }, [part.createdAt]);

  useEffect(() => {
    if (!isThinkingActive || typeof part.createdAt !== 'number') {
      return;
    }

    setReferenceTime(Date.now());
    const timer = window.setInterval(() => setReferenceTime(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isThinkingActive, part.createdAt]);

  const rawDisplayedElapsedSeconds =
    isThinkingActive && typeof part.createdAt === 'number'
      ? getLiveThinkingElapsedSeconds(part.createdAt, referenceTime)
      : part.elapsedSeconds;
  const displayedElapsedSeconds = resolveDisplayThinkingElapsedSeconds(
    rawDisplayedElapsedSeconds,
    lastDisplayedElapsedSecondsRef.current,
  );

  useEffect(() => {
    if (typeof displayedElapsedSeconds !== 'number') {
      return;
    }

    lastDisplayedElapsedSecondsRef.current = Math.max(
      lastDisplayedElapsedSecondsRef.current ?? displayedElapsedSeconds,
      displayedElapsedSeconds,
    );
  }, [displayedElapsedSeconds]);

  const durationLabel =
    typeof displayedElapsedSeconds === 'number' ? formatThinkingDuration(displayedElapsedSeconds) : '';
  const previewLine =
    part.content
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .find(Boolean) || '';
  const summaryLabel = isThinkingActive ? '思考中' : '思考过程';
  const summaryPreview = !isExpanded
    ? previewLine || (isThinkingActive ? '正在实时更新推理内容' : '')
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
            <div className="chat-thinking-empty">{'等待模型输出思考内容...'}</div>
          )}
        </div>
      </div>
    </div>
  );
});

export const AssistantTextBlock = memo(function AssistantTextBlock({
  content,
  isStreaming = false,
  onFirstVisibleChar,
  onFinalVisibleDone,
}: {
  content: string;
  isStreaming?: boolean;
  onFirstVisibleChar?: () => void;
  onFinalVisibleDone?: () => void;
}) {
  const observedStreamingRef = useRef(false);
  const reportedFirstVisibleRef = useRef(false);
  const inlineImagePaths = extractInlineImagePaths(content);

  useEffect(() => {
    if (isStreaming) {
      observedStreamingRef.current = true;
      if (content && !reportedFirstVisibleRef.current) {
        reportedFirstVisibleRef.current = true;
        onFirstVisibleChar?.();
      }
      return;
    }

    if (observedStreamingRef.current) {
      observedStreamingRef.current = false;
      reportedFirstVisibleRef.current = false;
      if (content) {
        onFinalVisibleDone?.();
      }
    }
  }, [content, isStreaming, onFinalVisibleDone, onFirstVisibleChar]);

  return (
    <div
      className={`chat-answer-text ${shouldUseAssistantDocumentLayout(content) ? 'document' : 'bubble'} ${isStreaming ? 'streaming' : ''}`}
    >
      {isStreaming ? (
        <div className="chat-answer-streaming-plain" aria-live="polite" aria-atomic="false">
          <span>{content}</span>
        </div>
      ) : (
        <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      )}
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
