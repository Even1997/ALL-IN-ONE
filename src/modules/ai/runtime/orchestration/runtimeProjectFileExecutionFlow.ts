import type { ApprovalRecord, ApprovalStatus } from '../approval/approvalTypes.ts';
import type { ProjectFileOperation, ProjectFileProposal } from '../../chat/projectFileOperations.ts';
import type { ActivityEntry } from '../../skills/activityLog.ts';
import {
  buildRuntimeProjectFileAutoExecuteFailure,
  buildRuntimeProjectFileAutoExecuteSuccess,
} from './runtimeTurnOutcomeFlow.ts';

export type RuntimeProjectFileExecutionResult = {
  ok: boolean;
  changedPaths: string[];
  message: string;
};

export type RuntimeProjectFileToolResponse = {
  success: boolean;
  content: string;
  error: string | null;
};

const verifyPersistedTextFile = async (input: {
  path: string;
  readProjectTextFile: (path: string) => Promise<string | null>;
  expectedContent?: string;
  operationLabel: string;
}) => {
  const persistedContent = await input.readProjectTextFile(input.path);
  if (persistedContent === null) {
    throw new Error(`${input.operationLabel}后未能在磁盘上验证文件：${input.path}`);
  }

  if (typeof input.expectedContent === 'string' && persistedContent !== input.expectedContent) {
    throw new Error(`${input.operationLabel}后文件内容校验失败：${input.path}`);
  }

  return persistedContent;
};

const findPendingApprovalByMessageId = (input: {
  activeApprovalThreadId: string | null;
  approvalsByThread: Record<string, ApprovalRecord[]>;
  messageId: string;
}) =>
  input.activeApprovalThreadId && input.approvalsByThread[input.activeApprovalThreadId]
    ? input.approvalsByThread[input.activeApprovalThreadId].find(
        (approval) => approval.messageId === input.messageId && approval.status === 'pending',
      ) || null
    : null;

export const executeRuntimeProjectFileOperations = async (input: {
  projectRoot: string;
  operations: ProjectFileOperation[];
  resolveProjectOperationPath: (projectRoot: string, targetPath: string) => string;
  isSupportedProjectTextFilePath: (path: string) => boolean;
  readProjectTextFile: (path: string) => Promise<string | null>;
  writeProjectTextFile: (path: string, content: string) => Promise<void>;
  getDirectoryPath: (path: string) => string;
  invokeTool: (
    command: 'tool_mkdir' | 'tool_edit' | 'tool_view' | 'tool_remove',
    params: Record<string, unknown>,
  ) => Promise<RuntimeProjectFileToolResponse>;
}): Promise<RuntimeProjectFileExecutionResult> => {
  const changedPaths: string[] = [];

  for (const operation of input.operations) {
    const absolutePath = input.resolveProjectOperationPath(input.projectRoot, operation.targetPath);

    if (!input.isSupportedProjectTextFilePath(absolutePath)) {
      throw new Error(`当前版本只支持文本文件操作：${operation.targetPath}`);
    }

    if (operation.type === 'create_file') {
      if (typeof operation.content !== 'string') {
        throw new Error(`新建文件缺少内容：${operation.targetPath}`);
      }

      const existingContent = await input.readProjectTextFile(absolutePath);
      if (existingContent !== null) {
        throw new Error(`文件已存在，不能按“新建”覆盖：${operation.targetPath}`);
      }

      const parentDirectory = input.getDirectoryPath(absolutePath);
      if (parentDirectory) {
        const mkdirResult = await input.invokeTool('tool_mkdir', {
          file_path: parentDirectory,
        });

        if (!mkdirResult.success) {
          throw new Error(mkdirResult.error || `无法创建目录：${parentDirectory}`);
        }
      }

      await input.writeProjectTextFile(absolutePath, operation.content);
      await verifyPersistedTextFile({
        path: absolutePath,
        readProjectTextFile: input.readProjectTextFile,
        expectedContent: operation.content,
        operationLabel: '新建文件',
      });
      changedPaths.push(operation.targetPath);
      continue;
    }

    if (operation.type === 'edit_file') {
      const existingContent = await input.readProjectTextFile(absolutePath);
      if (existingContent === null) {
        throw new Error(`找不到要编辑的文件：${operation.targetPath}`);
      }

      if (typeof operation.oldString === 'string') {
        const editResult = await input.invokeTool('tool_edit', {
          file_path: absolutePath,
          old_string: operation.oldString,
          new_string: operation.newString ?? '',
        });

        if (!editResult.success) {
          throw new Error(editResult.error || `编辑文件失败：${operation.targetPath}`);
        }

        const persistedContent = await verifyPersistedTextFile({
          path: absolutePath,
          readProjectTextFile: input.readProjectTextFile,
          operationLabel: '编辑文件',
        });
        if (
          persistedContent === existingContent ||
          (typeof operation.newString === 'string' &&
            operation.newString.length > 0 &&
            !persistedContent.includes(operation.newString))
        ) {
          throw new Error(`编辑后文件未出现预期变更：${operation.targetPath}`);
        }
      } else if (typeof operation.content === 'string') {
        await input.writeProjectTextFile(absolutePath, operation.content);
        await verifyPersistedTextFile({
          path: absolutePath,
          readProjectTextFile: input.readProjectTextFile,
          expectedContent: operation.content,
          operationLabel: '编辑文件',
        });
      } else {
        throw new Error(`编辑文件缺少可执行内容：${operation.targetPath}`);
      }

      changedPaths.push(operation.targetPath);
      continue;
    }

    const viewResult = await input.invokeTool('tool_view', {
      file_path: absolutePath,
      offset: 0,
      limit: 1,
    });
    if (!viewResult.success) {
      throw new Error(viewResult.error || `只能删除已存在的文本文件：${operation.targetPath}`);
    }

    const removeResult = await input.invokeTool('tool_remove', {
      file_path: absolutePath,
    });
    if (!removeResult.success) {
      throw new Error(removeResult.error || `删除文件失败：${operation.targetPath}`);
    }

    const deletedContent = await input.readProjectTextFile(absolutePath);
    if (deletedContent !== null) {
      throw new Error(`删除后文件仍然可读：${operation.targetPath}`);
    }

    changedPaths.push(operation.targetPath);
  }

  return {
    ok: true,
    changedPaths,
    message:
      changedPaths.length > 0
        ? `已执行 ${changedPaths.length} 项文件操作：${changedPaths.join('、')}`
        : '没有执行任何文件操作。',
  };
};

export const cancelRuntimeProjectFileProposal = async (input: {
  projectId: string;
  sessionId: string;
  messageId: string;
  activeApprovalThreadId: string | null;
  approvalsByThread: Record<string, ApprovalRecord[]>;
  updateMessage: (
    projectId: string,
    sessionId: string,
    messageId: string,
    updater: (message: any) => any,
  ) => void;
  resolveStoredApproval: (approvalId: string, status: ApprovalStatus) => void;
  clearPendingApprovalAction: (approvalId: string) => void;
  resolveAgentApproval: (payload: { approvalId: string; status: ApprovalStatus }) => Promise<unknown>;
}) => {
  const pendingApproval = findPendingApprovalByMessageId({
    activeApprovalThreadId: input.activeApprovalThreadId,
    approvalsByThread: input.approvalsByThread,
    messageId: input.messageId,
  });

  input.updateMessage(input.projectId, input.sessionId, input.messageId, (message) => ({
    ...message,
    projectFileProposal: message.projectFileProposal
      ? {
          ...message.projectFileProposal,
          status: 'cancelled',
          executionMessage: '已取消本次文件操作。',
        }
      : message.projectFileProposal,
  }));

  if (pendingApproval) {
    input.resolveStoredApproval(pendingApproval.id, 'denied');
    input.clearPendingApprovalAction(pendingApproval.id);
    await input.resolveAgentApproval({ approvalId: pendingApproval.id, status: 'denied' });
  }
};

export const executeRuntimeApprovedProjectFileProposal = async (input: {
  projectId: string;
  sessionId: string;
  messageId: string;
  proposal: ProjectFileProposal;
  activeApprovalThreadId: string | null;
  approvalsByThread: Record<string, ApprovalRecord[]>;
  updateMessage: (
    projectId: string,
    sessionId: string,
    messageId: string,
    updater: (message: any) => any,
  ) => void;
  resolveStoredApproval: (approvalId: string, status: ApprovalStatus) => void;
  clearPendingApprovalAction: (approvalId: string) => void;
  resolveAgentApproval: (payload: { approvalId: string; status: ApprovalStatus }) => Promise<unknown>;
  createRunId: () => string;
  createActivityEntryId: () => string;
  getProjectDir: (projectId: string) => Promise<string>;
  executeProjectFileOperations: (
    projectRoot: string,
    operations: ProjectFileOperation[],
  ) => Promise<RuntimeProjectFileExecutionResult>;
  appendActivityEntry: (projectId: string, entry: ActivityEntry) => void;
  normalizeErrorMessage: (error: unknown) => string;
}) => {
  const pendingApproval = findPendingApprovalByMessageId({
    activeApprovalThreadId: input.activeApprovalThreadId,
    approvalsByThread: input.approvalsByThread,
    messageId: input.messageId,
  });

  input.updateMessage(input.projectId, input.sessionId, input.messageId, (message) => ({
    ...message,
    projectFileProposal: message.projectFileProposal
      ? {
          ...message.projectFileProposal,
          status: 'executing',
          executionMessage: '正在执行文件操作...',
        }
      : message.projectFileProposal,
  }));

  if (pendingApproval) {
    input.resolveStoredApproval(pendingApproval.id, 'approved');
    input.clearPendingApprovalAction(pendingApproval.id);
    await input.resolveAgentApproval({ approvalId: pendingApproval.id, status: 'approved' });
  }

  const runId = input.createRunId();

  try {
    const projectRoot = await input.getProjectDir(input.projectId);
    const result = await input.executeProjectFileOperations(projectRoot, input.proposal.operations);
    const successOutcome = buildRuntimeProjectFileAutoExecuteSuccess({
      createId: input.createActivityEntryId,
      runId,
      result,
      preview: input.proposal.summary,
    });

    input.updateMessage(input.projectId, input.sessionId, input.messageId, (message) => ({
      ...message,
      content: input.proposal.assistantMessage,
      projectFileProposal: message.projectFileProposal
        ? {
            ...message.projectFileProposal,
            status: successOutcome.proposalStatus,
            executionMessage: successOutcome.executionMessage,
          }
        : message.projectFileProposal,
    }));
    input.appendActivityEntry(input.projectId, successOutcome.activityEntry);
  } catch (error) {
    const message = input.normalizeErrorMessage(error);
    const failureOutcome = buildRuntimeProjectFileAutoExecuteFailure({
      createId: input.createActivityEntryId,
      runId,
      message,
      operationPaths: input.proposal.operations.map((operation) => operation.targetPath),
      preview: input.proposal.summary,
    });

    input.updateMessage(input.projectId, input.sessionId, input.messageId, (currentMessage) => ({
      ...currentMessage,
      projectFileProposal: currentMessage.projectFileProposal
        ? {
            ...currentMessage.projectFileProposal,
            status: failureOutcome.proposalStatus,
            executionMessage: failureOutcome.executionMessage,
          }
        : currentMessage.projectFileProposal,
    }));
    input.appendActivityEntry(input.projectId, failureOutcome.activityEntry);
  }
};
