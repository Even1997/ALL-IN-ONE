import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { nord } from '@milkdown/theme-nord';

type MilkdownEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  editable?: boolean;
};

const MilkdownEditorInner = ({
  value,
  onChange,
  editable = true,
}: MilkdownEditorProps) => {
  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx.set(editorViewOptionsCtx, {
            editable: () => editable,
          });
        })
        .config((ctx) => {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
            if (markdown !== prevMarkdown) {
              onChange(markdown);
            }
          });
        })
        .config(nord)
        .use(commonmark)
        .use(listener),
    [editable]
  );

  return <Milkdown />;
};

export const MilkdownEditor = (props: MilkdownEditorProps) => (
  <MilkdownProvider>
    <MilkdownEditorInner {...props} />
  </MilkdownProvider>
);
