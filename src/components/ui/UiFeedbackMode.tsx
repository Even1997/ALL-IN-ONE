import { useEffect, useMemo, useState } from 'react';
import './UiFeedbackMode.css';

type FeedbackTarget = {
  selector: string;
  label: string;
  tagName: string;
  page: string;
  viewport: string;
  rect: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
};

type FeedbackItem = FeedbackTarget & {
  createdAt: string;
  id: string;
  note: string;
};

const FEEDBACK_STORAGE_KEY = 'goodnight-ui-feedback-items';

const escapeSelector = (value: string) => {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
};

const readFeedbackItems = (): FeedbackItem[] => {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getElementLabel = (element: Element) => {
  const htmlElement = element as HTMLElement;
  const ariaLabel = element.getAttribute('aria-label');
  const title = element.getAttribute('title');
  const placeholder = element.getAttribute('placeholder');
  const text = htmlElement.innerText || element.textContent || '';
  const compactText = text.replace(/\s+/g, ' ').trim();

  return ariaLabel || title || placeholder || compactText.slice(0, 80) || element.tagName.toLowerCase();
};

const getElementSelector = (element: Element) => {
  const testId = element.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;
  }

  if (element.id) {
    return `#${escapeSelector(element.id)}`;
  }

  const classNames = Array.from(element.classList).filter(Boolean).slice(0, 3);
  if (classNames.length > 0) {
    return `${element.tagName.toLowerCase()}.${classNames.map(escapeSelector).join('.')}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && parts.length < 4) {
    const parent: HTMLElement | null = current.parentElement;
    const tag = current.tagName.toLowerCase();

    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (child): child is Element => child instanceof Element && child.tagName === current?.tagName
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }

  return parts.join(' > ') || element.tagName.toLowerCase();
};

const getInitialEnabled = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get('uiFeedback') === '1';
};

export const UiFeedbackMode = () => {
  const [enabled, setEnabled] = useState(getInitialEnabled);
  const [target, setTarget] = useState<FeedbackTarget | null>(null);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<FeedbackItem[]>(() =>
    typeof window === 'undefined' ? [] : readFeedbackItems()
  );

  const exportText = useMemo(() => JSON.stringify(items, null, 2), [items]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handleClick = (event: MouseEvent) => {
      const clicked = event.target instanceof Element ? event.target : null;
      if (!clicked || clicked.closest('[data-ui-feedback-root]')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = clicked.getBoundingClientRect();
      setTarget({
        selector: getElementSelector(clicked),
        label: getElementLabel(clicked),
        tagName: clicked.tagName.toLowerCase(),
        page: window.location.pathname + window.location.search,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        rect: {
          height: Math.round(rect.height),
          width: Math.round(rect.width),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
        },
      });
      setNote('');
    };

    document.addEventListener('click', handleClick, true);

    return () => document.removeEventListener('click', handleClick, true);
  }, [enabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(FEEDBACK_STORAGE_KEY, exportText);
  }, [exportText]);

  if (!enabled) {
    return null;
  }

  const saveFeedback = () => {
    if (!target || !note.trim()) {
      return;
    }

    const nextItem: FeedbackItem = {
      ...target,
      id: crypto.randomUUID(),
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };

    setItems((current) => [...current, nextItem]);
    setTarget(null);
    setNote('');
  };

  const clearFeedback = () => {
    setItems([]);
    setTarget(null);
    setNote('');
  };

  const popoverLeft = target ? Math.min(target.rect.x, window.innerWidth - 360) : 0;
  const popoverTop = target ? Math.min(target.rect.y + target.rect.height + 8, window.innerHeight - 260) : 0;

  return (
    <div className="ui-feedback-layer" data-ui-feedback-root>
      {target ? (
        <div
          className="ui-feedback-highlight"
          style={{
            height: target.rect.height,
            left: target.rect.x,
            top: target.rect.y,
            width: target.rect.width,
          }}
        />
      ) : null}

      <div className="ui-feedback-toolbar">
        <div>
          <strong>UI feedback</strong>
          <span>点击页面元素，然后写修改意见</span>
        </div>
        <div className="ui-feedback-toolbar-actions">
          <span>{items.length} 条</span>
          <button type="button" onClick={clearFeedback}>
            清空
          </button>
          <button type="button" onClick={() => setEnabled(false)}>
            关闭
          </button>
        </div>
      </div>

      {target ? (
        <section className="ui-feedback-popover" style={{ left: popoverLeft, top: popoverTop }}>
          <header>
            <strong>{target.label}</strong>
            <code>{target.selector}</code>
          </header>
          <textarea
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：这个按钮太重、间距太挤、这里应该和左侧对齐..."
          />
          <footer>
            <button type="button" onClick={() => setTarget(null)}>
              取消
            </button>
            <button type="button" onClick={saveFeedback} disabled={!note.trim()}>
              保存意见
            </button>
          </footer>
        </section>
      ) : null}

      {items.length > 0 ? (
        <details className="ui-feedback-export">
          <summary>已记录的反馈</summary>
          <pre>{exportText}</pre>
        </details>
      ) : null}
    </div>
  );
};
