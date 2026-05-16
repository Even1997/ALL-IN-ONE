// 文件作用：编辑器组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import { GoodNightMarkdownEditor } from './GoodNightMarkdownEditor';

type MilkdownEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  editable?: boolean;
};

export const MilkdownEditor = (props: MilkdownEditorProps) => (
  <GoodNightMarkdownEditor {...props} />
);
