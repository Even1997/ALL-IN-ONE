// 文件作用：模块实现文件，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件定义单轮对话执行时传递的最小上下文快照，是 turn 编排层的输入边界。
// 它把项目、线程、用户输入、上下文窗口和技能集合整理成统一结构，方便后续 coordinator / executor 复用。
// 如果你在排查“某一轮拿到的项目信息不对 / 技能列表不对 / 输入上下文缺失”，先看这里的入参与构造点。
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes.ts';

// 这个 context 是 turn 执行期间会反复传递的最小上下文快照。
// 目前它很薄，但它明确了“这轮对话的项目、线程、输入、技能集合”这些核心事实。
export type RuntimeChatTurnContextInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  userInput: string;
  contextWindowTokens: number;
  activeSkills: RuntimeSkillDefinition[];
};

// 这里暂时只是原样返回，目的是给上层保留一个稳定入口，
// 后续如果 turn context 需要做标准化或派生字段扩展，可以集中落在这里。
export const buildRuntimeChatTurnContext = (input: RuntimeChatTurnContextInput) => input;
