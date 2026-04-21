import React, { useState, useCallback } from 'react';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { scopeDetector } from '../../modules/scope-detector/ChangeScopeDetector';
import { useFeatureTreeStore } from '../../store/featureTreeStore';
import './CodeEditor.css';

interface CodeEditorProps {
  featureId?: string;
  initialCode?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ featureId, initialCode }) => {
  const { generateForModule, isStreaming, codeBlocks } = useGlobalAIStore();
  const { getSelectedFeature } = useFeatureTreeStore();

  const [code, setCode] = useState(
    initialCode ||
      `// 在这里编写你的代码
import React from 'react';

export const Component: React.FC = () => {
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  );
};`
  );
  const [selectedLines, setSelectedLines] = useState<{ start: number; end: number } | null>(null);

  const selectedFeature = getSelectedFeature();
  const featureName = selectedFeature?.name || '未选择功能';

  const handleAIRefactor = useCallback(async () => {
    const scope = scopeDetector.detectComponentAddition('code-editor', { x: 0, y: 0 }, { code });
    await generateForModule(
      'code-editor',
      'optimize',
      scope,
      `请优化以下代码：\n${code}`,
      { featureId: featureId || 'unknown', featureName }
    );
  }, [code, featureId, featureName, generateForModule]);

  const handleAIFix = useCallback(async () => {
    const scope = {
      target: { type: 'component' as const, id: featureId || 'unknown', filePath: 'code.tsx' },
      change: { type: 'modify' as const, before: code, after: '修复代码' },
      related: { files: [], elements: [] },
    };
    await generateForModule(
      'code-editor',
      'fix',
      scope,
      `请检查并优化以下代码：\n${code}`,
      { featureId: featureId || 'unknown', featureName }
    );
  }, [code, featureId, featureName, generateForModule]);

  const handleAIComplete = useCallback(async () => {
    const scope = scopeDetector.detectComponentAddition('code-editor', { x: 0, y: 0 }, { code });
    await generateForModule(
      'code-editor',
      'generate',
      scope,
      `请补全以下不完整的代码：\n${code}`,
      { featureId: featureId || 'unknown', featureName }
    );
  }, [code, featureId, featureName, generateForModule]);

  const handleLineClick = useCallback(
    (lineNumber: number) => {
      if (selectedLines && selectedLines.start === lineNumber) {
        setSelectedLines(null);
      } else {
        setSelectedLines({ start: lineNumber, end: lineNumber });
      }
    },
    [selectedLines]
  );

  const applyCodeBlock = useCallback((blockCode: string) => {
    setCode(blockCode);
  }, []);

  const lines = code.split('\n');

  return (
    <div className="code-editor">
      {/* Header */}
      <div className="code-editor-header">
        <div className="file-info">
          <span className="file-icon">📄</span>
          <span className="file-name">{featureName}.tsx</span>
        </div>
        <div className="editor-actions">
          <button
            className="ai-btn"
            onClick={handleAIFix}
            disabled={isStreaming}
            title="AI 修复错误"
          >
            {isStreaming ? '⏳' : '🔧'} 修复
          </button>
          <button
            className="ai-btn"
            onClick={handleAIComplete}
            disabled={isStreaming}
            title="AI 补全代码"
          >
            {isStreaming ? '⏳' : '✨'} 补全
          </button>
          <button
            className="ai-btn primary"
            onClick={handleAIRefactor}
            disabled={isStreaming}
            title="AI 重构优化"
          >
            {isStreaming ? '⏳' : '🤖'} AI 优化
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="code-editor-content">
        {/* Line Numbers */}
        <div className="line-numbers">
          {lines.map((_, index) => (
            <div
              key={index}
              className={`line-number ${selectedLines && index + 1 >= selectedLines.start && index + 1 <= selectedLines.end ? 'selected' : ''}`}
              onClick={() => handleLineClick(index + 1)}
            >
              {index + 1}
            </div>
          ))}
        </div>

        {/* Code Area */}
        <textarea
          className="code-textarea"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const start = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              const newCode = code.substring(0, start) + '  ' + code.substring(end);
              setCode(newCode);
              setTimeout(() => {
                e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
              }, 0);
            }
          }}
          spellCheck={false}
        />
      </div>

      {/* AI Generated Code Blocks */}
      {codeBlocks.length > 0 && (
        <div className="ai-generated-blocks">
          <div className="blocks-header">
            <span>🤖 AI 生成的代码</span>
            <span className="block-count">{codeBlocks.length} 个代码块</span>
          </div>
          <div className="blocks-list">
            {codeBlocks.map((block, index) => (
              <div key={index} className="code-block-item">
                <div className="block-info">
                  <span className="block-action">{block.action}</span>
                  <span className="block-path">{block.filePath}</span>
                </div>
                <div className="block-actions">
                  <button onClick={() => navigator.clipboard.writeText(block.code)}>📋 复制</button>
                  <button onClick={() => applyCodeBlock(block.code)}>✓ 应用</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="code-editor-footer">
        <span>行数: {lines.length}</span>
        <span>|</span>
        <span>字符: {code.length}</span>
        <span>|</span>
        <span>功能: {featureName}</span>
      </div>
    </div>
  );
};
