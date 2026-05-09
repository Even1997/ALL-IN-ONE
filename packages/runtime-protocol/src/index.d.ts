export declare const DEFAULT_RUNTIME_HOST = "127.0.0.1";
export type RuntimeSessionSummary = {
    id: string;
    projectId: string;
    title: string;
    createdAt: number;
    updatedAt: number;
};
export type RuntimeMessageRecord = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: number;
};
export type RuntimeSessionSnapshot = {
    session: RuntimeSessionSummary;
    messages: RuntimeMessageRecord[];
    status: 'idle' | 'running' | 'failed';
};
export type RuntimeSessionCreateInput = {
    projectId: string;
    title?: string;
};
export type RuntimeEventEnvelope = {
    type: 'runtime.ready';
    emittedAt: number;
    payload: {
        host: string;
    };
} | {
    type: 'session.snapshot';
    emittedAt: number;
    payload: RuntimeSessionSnapshot;
} | {
    type: 'message.delta' | 'turn.finished';
    emittedAt: number;
    payload: {
        sessionId: string;
        message: RuntimeMessageRecord;
    };
};
export declare const buildRuntimeReadyEvent: () => RuntimeEventEnvelope;
export declare const isRuntimeEventEnvelope: (value: unknown) => value is RuntimeEventEnvelope;
