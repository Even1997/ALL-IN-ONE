import { convertFileSrc } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AIChatMessagePart } from './aiChatMessageParts';

export type AIChatMessagePartRenderOptions = {
  isStreaming: boolean;
  thinkingExpanded?: boolean;
  onToggleThinking?: () => void;
};

export const AssistantThinkingBlock = ({
  part,
  isStreaming,
  thinkingExpanded,
  onToggleThinking,
}: {
  part: Extract<AIChatMessagePart, { type: 'thinking' }>;
  isStreaming: boolean;
  thinkingExpanded?: boolean;
  onToggleThinking?: () => void;
}) => {
  const isExpanded = thinkingExpanded ?? !part.collapsed;
  const previewLine =
    part.content
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .find(Boolean) || '';
  const summaryLabel = isStreaming ? '思考中' : '思考过程';
  const summaryPreview = !isExpanded ? previewLine || (isStreaming ? '正在实时更新推理内容' : '') : '';

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
          <strong>{summaryLabel}</strong>
          {summaryPreview ? <span className="chat-thinking-preview">{summaryPreview}</span> : null}
        </span>
        {isStreaming ? (
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
};

export const AssistantTextBlock = ({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) => {
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
      {isStreaming ? <span className="chat-answer-stream-cursor" aria-hidden="true" /> : null}
    </div>
  );
};

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
