// 文件作用：卡片集合组件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type {
  KnowledgeSessionArtifactStatus,
  KnowledgeSessionArtifactType,
} from '../../../features/knowledge/store/knowledgeSessionArtifactsStore';

export type ChatCardAction = {
  id: string;
  label: string;
  prompt: string;
  tone?: 'default' | 'primary' | 'danger';
};

export type ChatStructuredCard =
  | {
      type: 'summary';
      title: string;
      body: string;
    }
  | {
      type: 'conflict';
      id: string;
      title: string;
      previousLabel: string;
      nextLabel: string;
      sourceTitles: string[];
      status: 'pending' | 'confirmed' | 'dismissed';
    }
  | {
      type: 'temporary-content';
      artifactId: string;
      title: string;
      artifactType: KnowledgeSessionArtifactType;
      summary: string;
      body: string;
      status: KnowledgeSessionArtifactStatus;
    }
  | {
      type: 'next-step';
      title: string;
      actions: ChatCardAction[];
    };
