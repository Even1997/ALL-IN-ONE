import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { AtomicCodeMirrorEditorProps } from '@atomic-editor/editor';
import '@atomic-editor/editor/styles.css';

type GoodNightMarkdownEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  editable?: boolean;
};

const AtomicCodeMirrorEditor = lazy(async () => {
  const [mod, langs] = await Promise.all([
    import('@atomic-editor/editor'),
    import('@atomic-editor/editor/code-languages'),
  ]);
  const Base = mod.AtomicCodeMirrorEditor;
  const Wrapped = (props: AtomicCodeMirrorEditorProps) => (
    <Base
      {...props}
      codeLanguages={props.codeLanguages ?? langs.ATOMIC_CODE_LANGUAGES}
    />
  );

  return { default: Wrapped };
});

export const GoodNightMarkdownEditor = ({
  value,
  onChange,
  editable = true,
}: GoodNightMarkdownEditorProps) => {
  const [documentRevision, setDocumentRevision] = useState(0);
  const lastEditorValueRef = useRef(value);

  useEffect(() => {
    if (value === lastEditorValueRef.current) {
      return;
    }

    lastEditorValueRef.current = value;
    setDocumentRevision((current) => current + 1);
  }, [value]);

  const readOnlyExtensions = useMemo(
    () =>
      editable
        ? []
        : [EditorState.readOnly.of(true), EditorView.editable.of(false)],
    [editable]
  );

  return (
    <Suspense fallback={<div className="pm-page-tree-empty">加载编辑器中...</div>}>
      <AtomicCodeMirrorEditor
        key={`${documentRevision}:${editable ? 'edit' : 'readonly'}`}
        documentId={`${documentRevision}:${editable ? 'edit' : 'readonly'}`}
        markdownSource={value}
        extensions={readOnlyExtensions}
        blurEditorOnMount={!editable}
        onMarkdownChange={(nextValue) => {
          lastEditorValueRef.current = nextValue;
          onChange(nextValue);
        }}
      />
    </Suspense>
  );
};
