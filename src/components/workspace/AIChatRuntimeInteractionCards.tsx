import React, { useState } from 'react';
import { isCommandToolName } from '../../utils/hostPlatform.ts';
import type {
  RuntimeQuestionItem,
  StoredChatRuntimeApprovalDisplay,
  StoredChatRuntimeEvent,
} from '../../modules/ai/store/aiChatStore';
import type { ApprovalRecord } from '../../modules/ai/runtime/approval/approvalTypes';

const buildInlineDiff = (oldStr: string, newStr: string): string[] => {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  let prefixEnd = 0;
  while (prefixEnd < oldLines.length && prefixEnd < newLines.length && oldLines[prefixEnd] === newLines[prefixEnd]) {
    prefixEnd += 1;
  }

  let suffixStartOld = oldLines.length;
  let suffixStartNew = newLines.length;
  while (
    suffixStartOld > prefixEnd
    && suffixStartNew > prefixEnd
    && oldLines[suffixStartOld - 1] === newLines[suffixStartNew - 1]
  ) {
    suffixStartOld -= 1;
    suffixStartNew -= 1;
  }

  const result: string[] = [];

  for (let i = Math.max(0, prefixEnd - 2); i < prefixEnd; i += 1) {
    result.push(` ${oldLines[i]}`);
  }

  for (let i = prefixEnd; i < suffixStartOld; i += 1) {
    result.push(`-${oldLines[i]}`);
  }

  for (let i = prefixEnd; i < suffixStartNew; i += 1) {
    result.push(`+${newLines[i]}`);
  }

  for (let i = suffixStartNew; i < Math.min(suffixStartNew + 2, newLines.length); i += 1) {
    result.push(` ${newLines[i]}`);
  }

  return result;
};

const RuntimeQuestionBlock: React.FC<{
  item: RuntimeQuestionItem;
  answered: boolean;
  answeredValue: string;
  onSubmit: (value: string) => void;
}> = ({ item, answered, answeredValue, onSubmit }) => {
  const [selectedOption, setSelectedOption] = useState('');
  const [freeText, setFreeText] = useState('');

  const effectiveValue = answeredValue || freeText || selectedOption;

  return (
    <div className="chat-runtime-question-item">
      {item.header ? <div className="chat-runtime-question-header">{item.header}</div> : null}
      <div className="chat-runtime-question-prompt">{item.question}</div>
      {item.options && item.options.length > 0 ? (
        <div className="chat-runtime-question-options">
          {item.options.map((option: NonNullable<RuntimeQuestionItem['options']>[number]) => (
            <button
              key={`${item.question}:${option.label}`}
              type="button"
              className={selectedOption === option.label || answeredValue === option.label ? 'active' : ''}
              disabled={answered}
              onClick={() => {
                setSelectedOption(option.label);
                setFreeText('');
              }}
            >
              <strong>{option.label}</strong>
              {option.description ? <span>{option.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {answered ? (
        <div className="chat-runtime-question-answer">{answeredValue}</div>
      ) : (
        <div className="chat-runtime-question-actions">
          <input
            className="chat-runtime-question-input"
            type="text"
            value={freeText}
            placeholder="直接输入回复"
            onChange={(event) => {
              setFreeText(event.target.value);
              if (event.target.value.trim()) {
                setSelectedOption('');
              }
            }}
          />
          <button
            type="button"
            className="chat-runtime-question-submit"
            disabled={!effectiveValue.trim()}
            onClick={() => onSubmit(effectiveValue.trim())}
          >
            提交
          </button>
        </div>
      )}
    </div>
  );
};

type ApprovalLabels = {
  approvalStatusLabelMap: Record<ApprovalRecord['status'], string>;
  approvalRiskLabelMap: Record<ApprovalRecord['riskLevel'], string>;
  approvalActionLabelMap: Record<string, string>;
};

export const AIChatRuntimeApprovalList: React.FC<{
  approvals: ApprovalRecord[];
  pendingApprovalDisplays: Record<string, StoredChatRuntimeApprovalDisplay | undefined>;
  summarizeProjectFilePath: (path: string) => string;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
} & ApprovalLabels> = ({
  approvals,
  pendingApprovalDisplays,
  summarizeProjectFilePath,
  onApprove,
  onDeny,
  approvalStatusLabelMap,
  approvalRiskLabelMap,
  approvalActionLabelMap,
}) => (
  <div className="chat-runtime-approval-list">
    {approvals.map((approval) => {
      const actionLabel = approvalActionLabelMap[approval.actionType] || approval.actionType;
      const pendingDisplay = pendingApprovalDisplays[approval.id];
      const showEditDiff =
        pendingDisplay?.toolName === 'edit'
        && typeof pendingDisplay.oldString === 'string'
        && typeof pendingDisplay.newString === 'string';
      const showWritePreview = pendingDisplay?.toolName === 'write' && typeof pendingDisplay.content === 'string';
      const pendingCommand = typeof pendingDisplay?.command === 'string' ? pendingDisplay.command : null;
      const showCommand = isCommandToolName(pendingDisplay?.toolName || '') && pendingCommand !== null;
      const showFilePath = Boolean(pendingDisplay?.filePath);

      return (
        <section key={approval.id} className={`chat-runtime-approval-card ${approval.riskLevel}`}>
          <div className="chat-runtime-approval-head">
            <strong>{approval.summary}</strong>
            <span>{approvalStatusLabelMap[approval.status]}</span>
          </div>
          <div className="chat-runtime-approval-meta">
            <span>{actionLabel}</span>
            <span>{approvalRiskLabelMap[approval.riskLevel]}</span>
          </div>
          {showFilePath ? (
            <div className="chat-runtime-approval-file">
              <code>{summarizeProjectFilePath(pendingDisplay!.filePath!)}</code>
            </div>
          ) : null}
          {showEditDiff ? (
            <pre className="chat-runtime-approval-diff">
              {buildInlineDiff(pendingDisplay!.oldString!, pendingDisplay!.newString!).map((line, index) => (
                <span
                  key={index}
                  className={line.startsWith('-') ? 'diff-removed' : line.startsWith('+') ? 'diff-added' : 'diff-context'}
                >
                  {line}
                  {'\n'}
                </span>
              ))}
            </pre>
          ) : showWritePreview ? (
            <pre className="chat-runtime-approval-write-preview">
              {pendingDisplay!.content!.slice(0, 800)}
              {pendingDisplay!.content!.length > 800 ? '\n...' : ''}
            </pre>
          ) : showCommand ? (
            <pre className="chat-runtime-approval-command">{pendingCommand}</pre>
          ) : pendingDisplay?.inputJson ? (
            <pre className="chat-runtime-approval-pre">{pendingDisplay.inputJson}</pre>
          ) : null}
          {approval.status === 'pending' ? (
            <div className="chat-runtime-approval-actions">
              <button type="button" onClick={() => onApprove(approval.id)}>
                批准执行
              </button>
              <button type="button" onClick={() => onDeny(approval.id)}>
                拒绝
              </button>
            </div>
          ) : null}
        </section>
      );
    })}
  </div>
);

type RuntimeInteractionEvent = Extract<StoredChatRuntimeEvent, { kind: 'approval' | 'question' }>;

export const AIChatRuntimeTimelineInteractionEvent: React.FC<{
  messageId: string;
  event: RuntimeInteractionEvent;
  summarizeProjectFilePath: (path: string) => string;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  onAnswerQuestion: (
    messageId: string,
    question: Extract<StoredChatRuntimeEvent, { kind: 'question' }>['payload'],
    answers: Record<string, string>,
  ) => void;
} & ApprovalLabels> = ({
  messageId,
  event,
  summarizeProjectFilePath,
  onApprove,
  onDeny,
  onAnswerQuestion,
  approvalStatusLabelMap,
  approvalRiskLabelMap,
  approvalActionLabelMap,
}) => {
  if (event.kind === 'approval') {
    return (
      <section key={event.id} className={`chat-runtime-approval-card ${event.riskLevel}`}>
        <div className="chat-runtime-approval-head">
          <strong>继续前想和你确认一下</strong>
          <span>{approvalStatusLabelMap[event.status]}</span>
        </div>
        <div className="chat-runtime-approval-summary">{event.summary}</div>
        <div className="chat-runtime-approval-meta">
          <span>{approvalActionLabelMap[event.actionType] || event.actionType}</span>
          <span>{approvalRiskLabelMap[event.riskLevel]}</span>
        </div>
        {event.display?.filePath ? (
          <div className="chat-runtime-approval-preview">
            <code>{summarizeProjectFilePath(event.display.filePath)}</code>
          </div>
        ) : null}
        {event.display?.command ? <pre className="chat-runtime-approval-pre">{event.display.command}</pre> : null}
        {event.display?.content && event.display.toolName === 'write' ? (
          <pre className="chat-runtime-approval-pre">{event.display.content}</pre>
        ) : null}
        {event.display?.newString && event.display.toolName === 'edit' ? (
          <pre className="chat-runtime-approval-pre">{event.display.newString}</pre>
        ) : null}
        {!event.display?.command && !event.display?.content && !event.display?.newString && event.display?.inputJson ? (
          <pre className="chat-runtime-approval-pre">{event.display.inputJson}</pre>
        ) : null}
        {event.status === 'pending' ? (
          <div className="chat-runtime-approval-actions">
            <button type="button" onClick={() => onApprove(event.approvalId)}>
              批准执行
            </button>
            <button type="button" onClick={() => onDeny(event.approvalId)}>
              拒绝
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  const question = event.payload;
  const isAnswered = question.status === 'answered';
  const answers = question.answers || {};

  return (
    <section key={event.id} className={`chat-runtime-question-card ${isAnswered ? 'answered' : 'pending'}`}>
      <div className="chat-runtime-question-head">
        <strong>还需要你补充一点信息</strong>
        <span>{isAnswered ? '已回答' : '等待输入'}</span>
      </div>
      <div className="chat-runtime-question-list">
        {question.questions.map((item, questionIndex) => {
          const answerKey = item.question;
          const answeredValue = answers[answerKey] || '';
          return (
            <RuntimeQuestionBlock
              key={`${event.questionId}-${questionIndex}`}
              item={item}
              answered={isAnswered}
              answeredValue={answeredValue}
              onSubmit={(value) =>
                onAnswerQuestion(messageId, question, {
                  ...answers,
                  [answerKey]: value,
                })
              }
            />
          );
        })}
      </div>
    </section>
  );
};
