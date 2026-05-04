import type { StoredChatRuntimeEvent } from '../../modules/ai/store/aiChatStore';
import type { RuntimeEventRenderModel } from './runtimeEventRenderModel';

export type RuntimeStatus = 'running' | 'completed' | 'failed' | 'blocked';

export type RuntimeToolHelpers = {
  summarizeRuntimeToolCall: (toolName: string, input: Record<string, unknown>) => string;
  getRuntimeToolHeadline: (toolName: string, input: Record<string, unknown>) => string;
  buildRuntimeToolStepPreview: (input: {
    status: RuntimeStatus;
    summary: string;
    output?: string;
    fileChanges?: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>;
    approvalCount: number;
    questionCount: number;
    childCount: number;
  }) => string;
  shouldOpenRuntimeToolStep: (input: {
    status: RuntimeStatus;
    approvalCount: number;
    questionCount: number;
  }) => boolean;
  shouldOpenRuntimeToolGroup: (
    toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
    renderModel: RuntimeEventRenderModel
  ) => boolean;
  shouldShowRuntimeToolBrief: (toolName: string, summary: string, headline: string) => boolean;
  shouldShowRuntimeToolTechnicalDetails: (input: {
    toolName: string;
    status: RuntimeStatus;
    toolInput: Record<string, unknown>;
    output?: string;
  }) => boolean;
  summarizeRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']> | undefined
  ) => string;
  summarizeRuntimeOutput: (output: string | undefined | null, maxLength?: number) => string;
  getRuntimeStatusLabel: (status: RuntimeStatus) => string;
  getRuntimeCommandCountLabel: (count: number) => string;
  buildRuntimeEventGroupSummary: (
    toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
    resultMap: Map<string, Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>>
  ) => string;
  summarizeProjectFilePath: (value: string) => string;
};
