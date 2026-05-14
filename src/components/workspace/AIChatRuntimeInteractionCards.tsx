import React, { useState } from 'react';
import { isCommandToolName } from '../../utils/hostPlatform.ts';
import type {
  RuntimeQuestionItem,
  StoredChatRuntimeApprovalDisplay,
  StoredChatRuntimeEvent,
} from '../../modules/ai/store/aiChatStore';
import type { ApprovalRecord } from '../../modules/ai/runtime/approval/approvalTypes';
import { MacButton, MacInput, StateCard } from '../ui';

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
    suffixStartOld > prefixEnd &&
    suffixStartNew > prefixEnd &&
    oldLines[suffixStartOld - 1] === newLines[suffixStartNew - 1]
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
    <div className="chat-runtime-question-item wb-runtime-question-item">
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
          <MacInput
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
          <MacButton
            type="button"
            variant="primary"
            size="sm"
            className="chat-runtime-question-submit"
            disabled={!effectiveValue.trim()}
            onClick={() => onSubmit(effectiveValue.trim())}
          >
            提交
          </MacButton>
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

const ApprovalDisplayPreview: React.FC<{
  display?: StoredChatRuntimeApprovalDisplay | null;
  summarizeProjectFilePath: (path: string) => string;
}> = ({ display, summarizeProjectFilePath }) => {
  const showEditDiff =
    display?.toolName === 'edit' &&
    typeof display.oldString === 'string' &&
    typeof display.newString === 'string';
  const showWritePreview = display?.toolName === 'write' && typeof display.content === 'string';
  const command = typeof display?.command === 'string' ? display.command : null;
  const showCommand = isCommandToolName(display?.toolName || '') && command !== null;

  return (
    <>
      {display?.filePath ? (
        <div className="chat-runtime-approval-file">
          <code>{summarizeProjectFilePath(display.filePath)}</code>
        </div>
      ) : null}
      {showEditDiff ? (
        <pre className="chat-runtime-approval-diff">
          {buildInlineDiff(display.oldString!, display.newString!).map((line, index) => (
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
          {display.content!.slice(0, 800)}
          {display.content!.length > 800 ? '\n...' : ''}
        </pre>
      ) : showCommand ? (
        <pre className="chat-runtime-approval-command">{command}</pre>
      ) : display?.inputJson ? (
        <pre className="chat-runtime-approval-pre">{display.inputJson}</pre>
      ) : null}
    </>
  );
};

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
    const tone = event.riskLevel === 'high' ? 'danger' : event.riskLevel === 'medium' ? 'warning' : 'info';
    const state = event.status === 'denied' ? 'error' : 'default';

    return (
      <StateCard
        title="执行前需要你确认"
        description={event.summary}
        meta={
          <>
            <span>{approvalStatusLabelMap[event.status]}</span>
            <span>{approvalActionLabelMap[event.actionType] || event.actionType}</span>
            <span>{approvalRiskLabelMap[event.riskLevel]}</span>
          </>
        }
        icon={event.status === 'denied' ? 'alertTriangle' : event.riskLevel === 'high' ? 'alertTriangle' : 'spark'}
        tone={tone}
        state={state}
        className={`chat-runtime-approval-card ${event.riskLevel}`}
        footer={
          event.status === 'pending' ? (
            <div className="chat-runtime-approval-actions">
              <MacButton type="button" variant="primary" size="sm" onClick={() => onApprove(event.approvalId)}>
                批准执行
              </MacButton>
              <MacButton type="button" variant="secondary" size="sm" onClick={() => onDeny(event.approvalId)}>
                拒绝
              </MacButton>
            </div>
          ) : null
        }
      >
        <ApprovalDisplayPreview
          display={event.display}
          summarizeProjectFilePath={summarizeProjectFilePath}
        />
      </StateCard>
    );
  }

  const question = event.payload;
  const isAnswered = question.status === 'answered';
  const answers = question.answers || {};

  return (
    <StateCard
      title="还需要你补充一点信息"
      description={isAnswered ? '问题已经回答，下面保留本次回复记录。' : '这些信息会继续沿用当前运行上下文。'}
      meta={<span>{isAnswered ? '已回答' : '等待输入'}</span>}
      icon={isAnswered ? 'checkCircle' : 'note'}
      tone="info"
      state={isAnswered ? 'selected' : 'default'}
      className={`chat-runtime-question-card ${isAnswered ? 'answered' : 'pending'}`}
    >
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
    </StateCard>
  );
};
