export const buildAIStatusCards = (latestInstruction, run) => {
    const cards = [];
    if (latestInstruction.trim()) {
        cards.push({
            title: '最新输入',
            content: latestInstruction.trim(),
            tone: 'neutral',
        });
    }
    if (!run) {
        cards.push({
            title: '当前状态',
            content: '还没有开始生成。输入一句需求或想法，我会从当前阶段继续推进。',
            tone: 'neutral',
        });
        return cards;
    }
    cards.push({
        title: '当前状态',
        content: run.status === 'error'
            ? run.error || '本轮执行失败，请检查配置或重新发送指令。'
            : run.status === 'awaiting_confirmation'
                ? '当前结果已生成，等待你确认后继续下一步。'
                : run.status === 'completed'
                    ? '当前阶段已确认完成。'
                    : 'AI 正在处理当前指令。',
        tone: run.status === 'error'
            ? 'error'
            : run.status === 'awaiting_confirmation'
                ? 'warning'
                : run.status === 'completed'
                    ? 'success'
                    : 'neutral',
    });
    const summaries = Object.entries(run.stageSummaries)
        .filter(([, value]) => Boolean(value))
        .map(([stage, value]) => `${stage}: ${value}`);
    if (summaries.length > 0) {
        cards.push({
            title: '最新结果',
            content: summaries.join('\n'),
            tone: run.status === 'error' ? 'error' : 'success',
        });
    }
    return cards;
};
