export const DEFAULT_RUNTIME_HOST = '127.0.0.1';
export const buildRuntimeReadyEvent = () => ({
    type: 'runtime.ready',
    emittedAt: Date.now(),
    payload: {
        host: DEFAULT_RUNTIME_HOST,
    },
});
export const isRuntimeEventEnvelope = (value) => {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return typeof candidate.type === 'string' && typeof candidate.emittedAt === 'number';
};
