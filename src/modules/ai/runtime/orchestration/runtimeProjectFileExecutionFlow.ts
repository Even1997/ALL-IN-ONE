// 文件作用：流程适配层，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
  fileChanges: Array<{
    path: string;
    operation: 'write' | 'edit' | 'delete';
    beforeContent: string | null;
    afterContent: string | null;
    verified: boolean;
  }>;
  message: string;
};

export type RuntimeProjectFileToolResponse = {
  success: boolean;
  content: string;
  error: string | null;
};

const buildRuntimeProjectFileExecutionMessage = (input: {
  changedPaths: string[];
  fileChanges: RuntimeProjectFileExecutionResult['fileChanges'];
  skippedNoopEdit?: boolean;
}) => {
  if (input.changedPaths.length === 0 && input.skippedNoopEdit) {
    return '目标文件内容未变化，未写入任何更新。';
  }

  if (input.changedPaths.length === 0) {
    return '没有执行任何文件操作。';
  }

  const deleteChanges = input.fileChanges.filter((change) => change.operation === 'delete');
  const writeChanges = input.fileChanges.filter((change) => change.operation === 'write');
  const editChanges = input.fileChanges.filter((change) => change.operation === 'edit');

  if (deleteChanges.length === input.fileChanges.length) {
    if (deleteChanges.length === 1) {
      return `已删除 ${deleteChanges[0].path}。`;
    }

    return `已删除 ${deleteChanges.length} 个文件：${deleteChanges.map((change) => change.path).join('、')}。`;
  }

  if (writeChanges.length === input.fileChanges.length) {
    if (writeChanges.length === 1) {
      return `已新建 ${writeChanges[0].path}。`;
    }

    return `已新建 ${writeChanges.length} 个文件：${writeChanges.map((change) => change.path).join('、')}。`;
  }

  if (editChanges.length === input.fileChanges.length) {
    if (editChanges.length === 1) {
      return `已修改 ${editChanges[0].path}。`;
    }

    return `已修改 ${editChanges.length} 个文件：${editChanges.map((change) => change.path).join('、')}。`;
  }

  return `已执行 ${input.changedPaths.length} 项文件操作：${input.changedPaths.join('、')}`;
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
  getDirectoryPath: (path: string) => string;
  invokeTool: (
    command: 'tool_mkdir' | 'tool_write' | 'tool_edit' | 'tool_view' | 'tool_remove',
    params: Record<string, unknown>,
  ) => Promise<RuntimeProjectFileToolResponse>;
}): Promise<RuntimeProjectFileExecutionResult> => {
  const changedPaths: string[] = [];
  const fileChanges: RuntimeProjectFileExecutionResult['fileChanges'] = [];
  let skippedNoopEdit = false;

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

      const writeResult = await input.invokeTool('tool_write', {
        file_path: absolutePath,
        content: operation.content,
      });
      if (!writeResult.success) {
        throw new Error(writeResult.error || `鏂板缓鏂囦欢澶辫触锛?{operation.targetPath}`);
      }
      await verifyPersistedTextFile({
        path: absolutePath,
        readProjectTextFile: input.readProjectTextFile,
        expectedContent: operation.content,
        operationLabel: '新建文件',
      });
      changedPaths.push(operation.targetPath);
      fileChanges.push({
        path: operation.targetPath,
        operation: 'write',
        beforeContent: null,
        afterContent: operation.content,
        verified: true,
      });
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
        if (existingContent === operation.content) {
          skippedNoopEdit = true;
          continue;
        }

        const writeResult = await input.invokeTool('tool_write', {
          file_path: absolutePath,
          content: operation.content,
        });
        if (!writeResult.success) {
          throw new Error(writeResult.error || `缂栬緫鏂囦欢澶辫触锛?{operation.targetPath}`);
        }
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
      fileChanges.push({
        path: operation.targetPath,
        operation: 'edit',
        beforeContent: existingContent,
        afterContent: await input.readProjectTextFile(absolutePath),
        verified: true,
      });
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
    const existingContent = await input.readProjectTextFile(absolutePath);

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
    fileChanges.push({
      path: operation.targetPath,
      operation: 'delete',
      beforeContent: existingContent,
      afterContent: null,
      verified: true,
    });
  }

  const message = buildRuntimeProjectFileExecutionMessage({
    changedPaths,
    fileChanges,
    skippedNoopEdit,
  });

  return {
    ok: true,
    changedPaths,
    fileChanges,
    message,
  };

  return {
    ok: true,
    changedPaths,
    fileChanges,
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
  resolveAgentApproval: (payload: {
    approvalId: string;
    status: ApprovalStatus;
    toolCallId?: string | null;
  }) => Promise<unknown>;
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
    // proposal 审批收口也要继续带上 toolCallId，避免项目文件流在回放/投影时丢链路。
    await input.resolveAgentApproval({
      approvalId: pendingApproval.id,
      status: 'denied',
      toolCallId: pendingApproval.toolCallId || null,
    });
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
  resolveAgentApproval: (payload: {
    approvalId: string;
    status: ApprovalStatus;
    toolCallId?: string | null;
  }) => Promise<unknown>;
  runId: string;
  createActivityEntryId: () => string;
  getProjectDir: (projectId: string) => Promise<string>;
  executeProjectFileOperations: (
    projectRoot: string,
    operations: ProjectFileOperation[],
  ) => Promise<RuntimeProjectFileExecutionResult>;
  appendActivityEntry: (projectId: string, entry: ActivityEntry) => void;
  normalizeErrorMessage: (error: unknown) => string;
  onExecutionStart?: () => Promise<void> | void;
  onExecutionSuccess?: (payload: {
    runId: string;
    messageId: string;
    summary: string;
    fileChanges: RuntimeProjectFileExecutionResult['fileChanges'];
  }) => Promise<void> | void;
  onExecutionFailed?: (payload: {
    runId: string;
    messageId: string;
    message: string;
  }) => Promise<void> | void;
}): Promise<boolean> => {
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
    // 批准恢复执行时同样保留 toolCallId，让审批卡、执行恢复和 timeline 共用同一事实键。
    await input.resolveAgentApproval({
      approvalId: pendingApproval.id,
      status: 'approved',
      toolCallId: pendingApproval.toolCallId || null,
    });
  }

  try {
    await input.onExecutionStart?.();
    const projectRoot = await input.getProjectDir(input.projectId);
    const result = await input.executeProjectFileOperations(projectRoot, input.proposal.operations);
    const successOutcome = buildRuntimeProjectFileAutoExecuteSuccess({
      createId: input.createActivityEntryId,
      runId: input.runId,
      result,
      preview: input.proposal.summary,
    });

    input.updateMessage(input.projectId, input.sessionId, input.messageId, (message) => ({
      ...message,
      content: result.message,
      projectFileProposal: message.projectFileProposal
        ? {
            ...message.projectFileProposal,
            status: successOutcome.proposalStatus,
            executionMessage: successOutcome.executionMessage,
          }
        : message.projectFileProposal,
    }));
    if (successOutcome.activityEntry) {
      input.appendActivityEntry(input.projectId, successOutcome.activityEntry);
    }
    await input.onExecutionSuccess?.({
      runId: input.runId,
      messageId: input.messageId,
      summary: result.message,
      fileChanges: result.fileChanges,
    });
    return true;
  } catch (error) {
    const message = input.normalizeErrorMessage(error);
    const failureOutcome = buildRuntimeProjectFileAutoExecuteFailure({
      createId: input.createActivityEntryId,
      runId: input.runId,
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
    await input.onExecutionFailed?.({
      runId: input.runId,
      messageId: input.messageId,
      message,
    });
    return false;
  }
};
