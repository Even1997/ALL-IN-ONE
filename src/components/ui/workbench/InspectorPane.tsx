import { forwardRef, type CSSProperties, type ReactNode } from 'react';

type InspectorPaneProps = {
  children: ReactNode;
  visible?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
};

export const InspectorPane = forwardRef<HTMLDivElement, InspectorPaneProps>(function InspectorPane(
  { children, visible = true, width, minWidth, maxWidth },
  ref,
) {
  const style: CSSProperties | undefined =
    typeof width === 'number'
      ? {
          flex: `0 0 ${width}px`,
          width,
          minWidth,
          maxWidth,
        }
      : undefined;

  return (
    <div
      ref={ref}
      className={`app-workbench-pane app-workbench-ai-shell desktop-ai-shell ${visible ? '' : 'is-hidden'}`}
      style={style}
    >
      <aside className="app-ai-activity-pane">{children}</aside>
    </div>
  );
});
