import assert from 'node:assert/strict';
import test from 'node:test';

const loadFlow = async () =>
  import(`../../src/modules/ai/runtime/orchestration/runtimeProjectFileExecutionFlow.ts?test=${Date.now()}`);

test('runtime project file execution flow executes create, edit, and delete operations through injected tool dependencies', async () => {
  const { executeRuntimeProjectFileOperations } = await loadFlow();

  const files = new Map([
    ['C:\\repo\\demo\\src\\app.ts', 'const a = 1;'],
    ['C:\\repo\\demo\\obsolete.md', 'old'],
  ]);
  const toolCalls = [];

  const result = await executeRuntimeProjectFileOperations({
    projectRoot: 'C:\\repo\\demo',
    operations: [
      {
        id: '1',
        type: 'create_file',
        targetPath: 'docs\\readme.md',
        summary: 'create readme',
        content: '# Demo',
      },
      {
        id: '2',
        type: 'edit_file',
        targetPath: 'src\\app.ts',
        summary: 'edit app',
        oldString: '1',
        newString: '2',
      },
      {
        id: '3',
        type: 'delete_file',
        targetPath: 'obsolete.md',
        summary: 'delete obsolete',
      },
    ],
    resolveProjectOperationPath: (projectRoot, targetPath) => `${projectRoot}\\${targetPath.replace(/\//g, '\\')}`,
    isSupportedProjectTextFilePath: () => true,
    readProjectTextFile: async (filePath) => files.get(filePath) ?? null,
    writeProjectTextFile: async (filePath, content) => {
      files.set(filePath, content);
    },
    getDirectoryPath: (filePath) => filePath.split('\\').slice(0, -1).join('\\'),
    invokeTool: async (command, params) => {
      toolCalls.push({ command, params });
      if (command === 'tool_edit') {
        const filePath = String(params.file_path);
        files.set(filePath, String(files.get(filePath)).replace(String(params.old_string), String(params.new_string)));
      }
      if (command === 'tool_remove') {
        files.delete(String(params.file_path));
      }
      return {
        success: true,
        content: '',
        error: null,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedPaths, ['docs\\readme.md', 'src\\app.ts', 'obsolete.md']);
  assert.match(result.message, /3/);
  assert.equal(files.get('C:\\repo\\demo\\docs\\readme.md'), '# Demo');
  assert.equal(files.get('C:\\repo\\demo\\src\\app.ts'), 'const a = 2;');
  assert.equal(files.has('C:\\repo\\demo\\obsolete.md'), false);
  assert.deepEqual(toolCalls.map((call) => call.command), ['tool_mkdir', 'tool_edit', 'tool_view', 'tool_remove']);
});

test('runtime project file execution flow rejects unsupported operations', async () => {
  const { executeRuntimeProjectFileOperations } = await loadFlow();

  await assert.rejects(
    executeRuntimeProjectFileOperations({
      projectRoot: '/repo',
      operations: [{ id: '1', type: 'create_file', targetPath: 'logo.png', summary: 'bad', content: 'x' }],
      resolveProjectOperationPath: (_projectRoot, targetPath) => `/repo/${targetPath}`,
      isSupportedProjectTextFilePath: () => false,
      readProjectTextFile: async () => null,
      writeProjectTextFile: async () => undefined,
      getDirectoryPath: () => '/repo',
      invokeTool: async () => ({ success: true, content: '', error: null }),
    }),
    /logo\.png/,
  );
});

test('runtime project file execution flow fails when created files cannot be verified on disk', async () => {
  const { executeRuntimeProjectFileOperations } = await loadFlow();

  await assert.rejects(
    executeRuntimeProjectFileOperations({
      projectRoot: 'C:\\repo\\demo',
      operations: [
        {
          id: '1',
          type: 'create_file',
          targetPath: 'docs\\missing.md',
          summary: 'create missing file',
          content: '# Missing',
        },
      ],
      resolveProjectOperationPath: (projectRoot, targetPath) => `${projectRoot}\\${targetPath.replace(/\//g, '\\')}`,
      isSupportedProjectTextFilePath: () => true,
      readProjectTextFile: async () => null,
      writeProjectTextFile: async () => undefined,
      getDirectoryPath: (filePath) => filePath.split('\\').slice(0, -1).join('\\'),
      invokeTool: async () => ({ success: true, content: '', error: null }),
    }),
    /missing\.md/,
  );
});

test('runtime project file execution flow cancels pending proposals and resolves approval state', async () => {
  const { cancelRuntimeProjectFileProposal } = await loadFlow();

  let currentMessage = {
    content: 'assistant',
    projectFileProposal: {
      id: 'proposal-1',
      mode: 'manual',
      status: 'pending',
      summary: 'Edit file',
      assistantMessage: 'Please confirm',
      operations: [],
      executionMessage: null,
    },
  };
  const resolved = [];
  const cleared = [];
  const backendResolved = [];

  await cancelRuntimeProjectFileProposal({
    projectId: 'project-1',
    sessionId: 'session-1',
    messageId: 'message-1',
    activeApprovalThreadId: 'thread-1',
    approvalsByThread: {
      'thread-1': [
        {
          id: 'approval-1',
          threadId: 'thread-1',
          actionType: 'tool_edit',
          riskLevel: 'medium',
          summary: 'Edit file',
          status: 'pending',
          createdAt: 1,
          messageId: 'message-1',
        },
      ],
    },
    updateMessage: (_projectId, _sessionId, _messageId, updater) => {
      currentMessage = updater(currentMessage);
    },
    resolveStoredApproval: (approvalId, status) => {
      resolved.push({ approvalId, status });
    },
    clearPendingApprovalAction: (approvalId) => {
      cleared.push(approvalId);
    },
    resolveAgentApproval: async (payload) => {
      backendResolved.push(payload);
    },
  });

  assert.equal(currentMessage.projectFileProposal.status, 'cancelled');
  assert.deepEqual(resolved, [{ approvalId: 'approval-1', status: 'denied' }]);
  assert.deepEqual(cleared, ['approval-1']);
  assert.deepEqual(backendResolved, [{ approvalId: 'approval-1', status: 'denied' }]);
});

test('runtime project file execution flow executes approved proposals and records activity outcome', async () => {
  const { executeRuntimeApprovedProjectFileProposal } = await loadFlow();

  let currentMessage = {
    content: 'assistant',
    projectFileProposal: {
      id: 'proposal-1',
      mode: 'manual',
      status: 'pending',
      summary: 'Edit file',
      assistantMessage: 'Applied the change',
      operations: [{ id: 'op-1', type: 'edit_file', targetPath: 'src/app.ts', summary: 'edit app' }],
      executionMessage: null,
    },
  };
  const appendedEntries = [];
  const resolved = [];
  const cleared = [];
  const backendResolved = [];

  await executeRuntimeApprovedProjectFileProposal({
    projectId: 'project-1',
    sessionId: 'session-1',
    messageId: 'message-1',
    proposal: currentMessage.projectFileProposal,
    activeApprovalThreadId: 'thread-1',
    approvalsByThread: {
      'thread-1': [
        {
          id: 'approval-1',
          threadId: 'thread-1',
          actionType: 'tool_edit',
          riskLevel: 'medium',
          summary: 'Edit file',
          status: 'pending',
          createdAt: 1,
          messageId: 'message-1',
        },
      ],
    },
    updateMessage: (_projectId, _sessionId, _messageId, updater) => {
      currentMessage = updater(currentMessage);
    },
    resolveStoredApproval: (approvalId, status) => {
      resolved.push({ approvalId, status });
    },
    clearPendingApprovalAction: (approvalId) => {
      cleared.push(approvalId);
    },
    resolveAgentApproval: async (payload) => {
      backendResolved.push(payload);
    },
    createRunId: () => 'run-1',
    createActivityEntryId: () => 'activity-1',
    getProjectDir: async () => 'C:\\repo\\demo',
    executeProjectFileOperations: async () => ({
      ok: true,
      changedPaths: ['src/app.ts'],
      message: 'edited src/app.ts',
    }),
    appendActivityEntry: (_projectId, entry) => {
      appendedEntries.push(entry);
    },
    normalizeErrorMessage: (error) => String(error),
  });

  assert.equal(currentMessage.content, 'Applied the change');
  assert.equal(currentMessage.projectFileProposal.status, 'executed');
  assert.equal(currentMessage.projectFileProposal.executionMessage, 'edited src/app.ts');
  assert.equal(appendedEntries.length, 1);
  assert.deepEqual(resolved, [{ approvalId: 'approval-1', status: 'approved' }]);
  assert.deepEqual(cleared, ['approval-1']);
  assert.deepEqual(backendResolved, [{ approvalId: 'approval-1', status: 'approved' }]);
});
