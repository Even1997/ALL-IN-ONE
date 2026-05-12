import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  RuntimeCheckpointDiffRecord,
  RuntimeCheckpointRecord,
  RuntimeCheckpointRewindInput,
  RuntimeCheckpointRewindResult,
  RuntimeReplayAppendInput,
  RuntimeReplayEvent,
} from '@goodnight/runtime-protocol';
import type { ToolResultFileChange } from '../../../src/modules/ai/runtime/tools/toolExecutor.ts';

type StoredCheckpointFileChange = RuntimeCheckpointDiffRecord & {
  sessionId: string;
  messageId: string | null;
  checkpointId: string;
  projectRoot: string;
};

type ReplayStoreData = {
  replayEvents: RuntimeReplayEvent[];
  checkpoints: RuntimeCheckpointRecord[];
  fileChanges: StoredCheckpointFileChange[];
};

type RuntimeCheckpointSaveInput = {
  sessionId: string;
  runId: string;
  messageId: string | null;
  summary: string;
  projectRoot: string;
  files: ToolResultFileChange[];
};

const STORE_FILE_NAME = 'sidecar-runtime-replay.json';

const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createEmptyStore = (): ReplayStoreData => ({
  replayEvents: [],
  checkpoints: [],
  fileChanges: [],
});

const splitLines = (content: string) => (content.length === 0 ? [] : content.split('\n'));

const buildLineDiff = (
  beforeContent: string | null,
  afterContent: string | null,
): { diff: string; insertions: number; deletions: number } => {
  if (beforeContent === null && afterContent === null) {
    return { diff: '', insertions: 0, deletions: 0 };
  }

  if (beforeContent === null && afterContent !== null) {
    const lines = splitLines(afterContent);
    return {
      diff: lines.map((line) => `+${line}`).join('\n'),
      insertions: lines.length,
      deletions: 0,
    };
  }

  if (beforeContent !== null && afterContent === null) {
    const lines = splitLines(beforeContent);
    return {
      diff: lines.map((line) => `-${line}`).join('\n'),
      insertions: 0,
      deletions: lines.length,
    };
  }

  const beforeLines = splitLines(beforeContent || '');
  const afterLines = splitLines(afterContent || '');
  const lcs = Array.from({ length: beforeLines.length + 1 }, () =>
    Array.from({ length: afterLines.length + 1 }, () => 0),
  );

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? lcs[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(lcs[beforeIndex + 1][afterIndex], lcs[beforeIndex][afterIndex + 1]);
    }
  }

  let beforeIndex = 0;
  let afterIndex = 0;
  const diffLines: string[] = [];
  let insertions = 0;
  let deletions = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      diffLines.push(` ${beforeLines[beforeIndex]}`);
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (lcs[beforeIndex + 1][afterIndex] >= lcs[beforeIndex][afterIndex + 1]) {
      diffLines.push(`-${beforeLines[beforeIndex]}`);
      deletions += 1;
      beforeIndex += 1;
      continue;
    }

    diffLines.push(`+${afterLines[afterIndex]}`);
    insertions += 1;
    afterIndex += 1;
  }

  while (beforeIndex < beforeLines.length) {
    diffLines.push(`-${beforeLines[beforeIndex]}`);
    deletions += 1;
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    diffLines.push(`+${afterLines[afterIndex]}`);
    insertions += 1;
    afterIndex += 1;
  }

  return {
    diff: diffLines.join('\n'),
    insertions,
    deletions,
  };
};

const resolveCheckpointPath = (projectRoot: string, storedPath: string) =>
  path.join(projectRoot, storedPath.trim().replace(/^[\\/]+/, ''));

const normalizeToolResultFileChange = (file: ToolResultFileChange) => ({
  path: file.path.replace(/\\/g, '/'),
  beforeContent:
    typeof file.beforeContent === 'string' || file.beforeContent === null ? file.beforeContent : null,
  afterContent:
    typeof file.afterContent === 'string' || file.afterContent === null ? file.afterContent : null,
});

export class NodeRuntimeReplayStore {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private getStoreFilePath() {
    return path.join(this.dataDir, STORE_FILE_NAME);
  }

  private async loadStore(): Promise<ReplayStoreData> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const content = await readFile(this.getStoreFilePath(), 'utf8');
      const parsed = JSON.parse(content) as Partial<ReplayStoreData>;
      return {
        replayEvents: Array.isArray(parsed.replayEvents) ? parsed.replayEvents : [],
        checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
        fileChanges: Array.isArray(parsed.fileChanges) ? parsed.fileChanges : [],
      };
    } catch {
      return createEmptyStore();
    }
  }

  private async saveStore(store: ReplayStoreData) {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.getStoreFilePath(), JSON.stringify(store, null, 2), 'utf8');
  }

  async appendReplayEvent(input: RuntimeReplayAppendInput): Promise<RuntimeReplayEvent> {
    const store = await this.loadStore();
    const event: RuntimeReplayEvent = {
      id: createId('replay'),
      sessionId: input.sessionId,
      eventType: input.eventType,
      payload: input.payload,
      createdAt: Date.now(),
    };
    store.replayEvents.push(event);
    await this.saveStore(store);
    return event;
  }

  async listReplayEvents(sessionId: string): Promise<RuntimeReplayEvent[]> {
    const store = await this.loadStore();
    return store.replayEvents
      .filter((event) => event.sessionId === sessionId)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  async deleteSessionArtifacts(sessionId: string): Promise<void> {
    const store = await this.loadStore();
    store.replayEvents = store.replayEvents.filter((event) => event.sessionId !== sessionId);
    store.checkpoints = store.checkpoints.filter((checkpoint) => checkpoint.sessionId !== sessionId);
    store.fileChanges = store.fileChanges.filter((change) => change.sessionId !== sessionId);
    await this.saveStore(store);
  }

  async saveCheckpoint(input: RuntimeCheckpointSaveInput): Promise<RuntimeCheckpointRecord | null> {
    if (input.files.length === 0) {
      return null;
    }

    const store = await this.loadStore();
    const now = Date.now();
    const checkpointId = createId('checkpoint');
    const previousFileChanges = [...store.fileChanges];
    const existingCreatedAt =
      store.checkpoints.find(
        (checkpoint) => checkpoint.sessionId === input.sessionId && checkpoint.runId === input.runId,
      )?.createdAt || now;

    store.checkpoints = store.checkpoints.filter(
      (checkpoint) => !(checkpoint.sessionId === input.sessionId && checkpoint.runId === input.runId),
    );
    store.fileChanges = store.fileChanges.filter(
      (change) => !(change.sessionId === input.sessionId && change.runId === input.runId),
    );

    const filesChanged: RuntimeCheckpointRecord['filesChanged'] = [];
    const fileChanges: StoredCheckpointFileChange[] = [];
    let insertions = 0;
    let deletions = 0;

    for (const sourceFile of input.files) {
      const file = normalizeToolResultFileChange(sourceFile);
      const previousAfterContent =
        previousFileChanges
          .filter((change) => change.sessionId === input.sessionId && change.path === file.path)
          .sort((left, right) => right.createdAt - left.createdAt)[0]
          ?.afterContent || null;
      const beforeContent = file.beforeContent ?? previousAfterContent;
      const afterContent = file.afterContent;
      const changeType =
        beforeContent === null && afterContent !== null
          ? 'created'
          : beforeContent !== null && afterContent === null
            ? 'deleted'
            : 'updated';
      const nextDiff = buildLineDiff(beforeContent, afterContent);

      filesChanged.push({
        path: file.path,
        changeType,
        insertions: nextDiff.insertions,
        deletions: nextDiff.deletions,
      });
      fileChanges.push({
        checkpointId,
        sessionId: input.sessionId,
        runId: input.runId,
        messageId: input.messageId,
        projectRoot: input.projectRoot,
        path: file.path,
        changeType,
        beforeContent,
        afterContent,
        diff: nextDiff.diff,
        insertions: nextDiff.insertions,
        deletions: nextDiff.deletions,
        createdAt: now,
      });
      insertions += nextDiff.insertions;
      deletions += nextDiff.deletions;
    }

    const checkpoint: RuntimeCheckpointRecord = {
      id: checkpointId,
      sessionId: input.sessionId,
      runId: input.runId,
      messageId: input.messageId,
      summary: input.summary,
      filesChanged,
      insertions,
      deletions,
      createdAt: existingCreatedAt,
      updatedAt: now,
    };

    store.checkpoints.push(checkpoint);
    store.fileChanges.push(...fileChanges);
    await this.saveStore(store);
    return checkpoint;
  }

  async listCheckpoints(sessionId: string): Promise<RuntimeCheckpointRecord[]> {
    const store = await this.loadStore();
    return store.checkpoints
      .filter((checkpoint) => checkpoint.sessionId === sessionId)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async getCheckpointDiff(input: {
    sessionId: string;
    runId: string;
    path: string;
  }): Promise<RuntimeCheckpointDiffRecord> {
    const store = await this.loadStore();
    const change = store.fileChanges
      .filter(
        (entry) =>
          entry.sessionId === input.sessionId &&
          entry.runId === input.runId &&
          entry.path === input.path,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0];

    if (!change) {
      throw new Error(
        `Checkpoint diff not found for session ${input.sessionId}, run ${input.runId}, path ${input.path}`,
      );
    }

    return {
      checkpointId: change.checkpointId,
      sessionId: change.sessionId,
      runId: change.runId,
      path: change.path,
      changeType: change.changeType,
      beforeContent: change.beforeContent,
      afterContent: change.afterContent,
      diff: change.diff,
      insertions: change.insertions,
      deletions: change.deletions,
      createdAt: change.createdAt,
    };
  }

  async rewindCheckpoint(input: RuntimeCheckpointRewindInput): Promise<RuntimeCheckpointRewindResult> {
    const store = await this.loadStore();
    const targetCheckpoint = store.checkpoints.find(
      (checkpoint) => checkpoint.sessionId === input.sessionId && checkpoint.id === input.checkpointId,
    );

    if (!targetCheckpoint) {
      throw new Error(
        `Checkpoint not found for session ${input.sessionId}, checkpoint ${input.checkpointId}`,
      );
    }

    const rewindCheckpoints = store.checkpoints.filter(
      (checkpoint) =>
        checkpoint.sessionId === input.sessionId &&
        checkpoint.createdAt >= targetCheckpoint.createdAt,
    );
    const rewindRunIds = new Set(rewindCheckpoints.map((checkpoint) => checkpoint.runId));
    const rewindFileChanges = store.fileChanges
      .filter(
        (change) => change.sessionId === input.sessionId && rewindRunIds.has(change.runId),
      )
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt ||
          right.runId.localeCompare(left.runId) ||
          right.path.localeCompare(left.path),
      );

    const restoredPaths: string[] = [];
    const restoredPathSet = new Set<string>();

    for (const change of rewindFileChanges) {
      const targetPath = resolveCheckpointPath(change.projectRoot, change.path);
      if (change.beforeContent === null) {
        await rm(targetPath, { recursive: true, force: true });
      } else {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, change.beforeContent, 'utf8');
      }

      if (!restoredPathSet.has(change.path)) {
        restoredPathSet.add(change.path);
        restoredPaths.push(change.path);
      }
    }

    store.checkpoints = store.checkpoints.filter(
      (checkpoint) => !(checkpoint.sessionId === input.sessionId && rewindRunIds.has(checkpoint.runId)),
    );
    store.fileChanges = store.fileChanges.filter(
      (change) => !(change.sessionId === input.sessionId && rewindRunIds.has(change.runId)),
    );
    await this.saveStore(store);

    return {
      sessionId: input.sessionId,
      runId: targetCheckpoint.runId,
      restoredPaths,
      removedRunIds: [...rewindRunIds].sort(),
      checkpointCount: rewindCheckpoints.length,
      rewoundAt: Date.now(),
    };
  }
}
