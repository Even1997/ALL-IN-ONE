import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const WIKI_LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;
const WIKI_LINK_PROTOCOL = 'goodnight://knowledge-link';

export type KnowledgeInternalLinkTarget = {
  noteTitle: string | null;
  heading: string | null;
};

type KnowledgeMarkdownViewerProps = {
  markdown: string;
  onOpenInternalLink?: (target: KnowledgeInternalLinkTarget) => void;
};

type ParsedWikiLinkTarget = KnowledgeInternalLinkTarget & {
  label: string;
};

const slugifyMarkdownHeading = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-');

const getMarkdownText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => getMarkdownText(item)).join('');
  }

  if (value && typeof value === 'object' && 'props' in value) {
    return getMarkdownText((value as { props?: { children?: unknown } }).props?.children);
  }

  return '';
};

const splitMarkdownOutsideCodeFences = (markdown: string) =>
  markdown.split(/(```[\s\S]*?```)/g).filter((segment) => segment.length > 0);

const buildInternalWikiHref = (target: KnowledgeInternalLinkTarget) => {
  const params = new URLSearchParams();
  if (target.noteTitle) {
    params.set('note', target.noteTitle);
  }
  if (target.heading) {
    params.set('heading', target.heading);
  }
  return `${WIKI_LINK_PROTOCOL}?${params.toString()}`;
};

const parseWikiLinkTarget = (raw: string): ParsedWikiLinkTarget => {
  const [targetPart, aliasPart] = raw.split('|');
  const [notePart, headingPart] = (targetPart || '').split('#');
  const noteTitle = notePart?.trim().replace(/\.(md|markdown)$/i, '') || null;
  const heading = headingPart?.trim() || null;
  const alias = aliasPart?.trim() || null;

  return {
    noteTitle,
    heading,
    label: alias || (heading && noteTitle ? `${noteTitle} > ${heading}` : heading || noteTitle || raw.trim()),
  };
};

const rewriteObsidianWikiLinks = (markdown: string) =>
  splitMarkdownOutsideCodeFences(markdown)
    .map((segment) => {
      if (segment.startsWith('```')) {
        return segment;
      }

      return segment.replace(WIKI_LINK_PATTERN, (_, rawTarget: string) => {
        const target = parseWikiLinkTarget(rawTarget);
        return `[${target.label}](${buildInternalWikiHref(target)})`;
      });
    })
    .join('');

const decodeInternalWikiHref = (href: string): KnowledgeInternalLinkTarget | null => {
  if (!href.startsWith(WIKI_LINK_PROTOCOL)) {
    return null;
  }

  const url = new URL(href);
  return {
    noteTitle: url.searchParams.get('note'),
    heading: url.searchParams.get('heading'),
  };
};

const headingComponent =
  (Tag: keyof Pick<Components, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>) =>
  ({ children }: { children?: ReactNode }) => {
    const text = getMarkdownText(children);
    const id = slugifyMarkdownHeading(text);
    return <Tag id={id}>{children}</Tag>;
  };

const markdownComponents: Components = {
  h1: headingComponent('h1'),
  h2: headingComponent('h2'),
  h3: headingComponent('h3'),
  h4: headingComponent('h4'),
  h5: headingComponent('h5'),
  h6: headingComponent('h6'),
};

export const KnowledgeMarkdownViewer = ({
  markdown,
  onOpenInternalLink,
}: KnowledgeMarkdownViewerProps) => {
  const rewrittenMarkdown = rewriteObsidianWikiLinks(markdown);

  const components: Components = {
    ...markdownComponents,
    a: ({ href, children }) => {
      const decodedTarget = href ? decodeInternalWikiHref(href) : null;

      if (decodedTarget) {
        return (
          <a
            href={href}
            data-knowledge-link="true"
            onClick={(event) => {
              event.preventDefault();

              if (!decodedTarget.noteTitle && decodedTarget.heading) {
                document.getElementById(slugifyMarkdownHeading(decodedTarget.heading))?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
                return;
              }

              onOpenInternalLink?.(decodedTarget);
            }}
          >
            {children}
          </a>
        );
      }

      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };

  return (
    <article className="gn-markdown-viewer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {rewrittenMarkdown}
      </ReactMarkdown>
    </article>
  );
};
