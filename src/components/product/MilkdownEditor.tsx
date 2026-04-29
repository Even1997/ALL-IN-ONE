import { GoodNightMarkdownEditor } from './GoodNightMarkdownEditor';

type MilkdownEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  editable?: boolean;
};

export const MilkdownEditor = (props: MilkdownEditorProps) => (
  <GoodNightMarkdownEditor {...props} />
);
