import { AtomicMarkdownEditor } from './AtomicMarkdownEditor';

type MilkdownEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  editable?: boolean;
};

export const MilkdownEditor = (props: MilkdownEditorProps) => (
  <AtomicMarkdownEditor {...props} />
);
