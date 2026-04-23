import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useGlobalAIStore } from '../../modules/ai/store/globalAIStore';
import { aiService } from '../../modules/ai/core/AIService';
import './AIChat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  onContextInject?: (content: string) => void;
}

export const AIChat: React.FC<AIChatProps> = ({ onContextInject }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `AI Coding Assistant 已就绪。

我可以帮你：
- 写代码和改代码
- 搜索文件与关键字
- 查看和理解代码结构
- 执行常用命令
- 解释报错和实现逻辑

直接描述你的目标，或者让我先帮你定位相关文件。`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { isConfigured, provider, model } = useGlobalAIStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (isConfigured) {
        await processAIResponse(userMessage.content, assistantMessage.id);
      } else {
        await simulateResponse(userMessage.content, assistantMessage.id);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, isConfigured]);

  const processAIResponse = async (userInput: string, messageId: string) => {
    const response = await aiService.chat(userInput, {
      onChunk: (text) => appendToMessage(messageId, text),
    });

    updateMessage(messageId, response);
  };

  const simulateResponse = async (userInput: string, messageId: string) => {
    const lowerInput = userInput.toLowerCase();

    if (
      lowerInput.includes('write') ||
      lowerInput.includes('create') ||
      lowerInput.includes('生成') ||
      lowerInput.includes('写')
    ) {
      updateMessage(messageId, `我可以先帮你生成一版代码草稿。

<tool_use>
<tool name="write">
<tool_params>{"file_path": "src/generated/Component.tsx", "content": "import React from 'react';\n\nexport const GeneratedComponent: React.FC = () => {\n  return (\n    <div className=\"generated\">\n      <h2>AI Generated Component</h2>\n      <p>Your custom component code here</p>\n    </div>\n  );\n};\n"}</tool_params>
</tool>
</tool_use>

已创建示例文件：\`src/generated/Component.tsx\`

接下来你可以继续让我：
- 改成真实业务组件
- 拆分样式
- 补充交互逻辑`);
    } else if (
      lowerInput.includes('search') ||
      lowerInput.includes('find') ||
      lowerInput.includes('搜索') ||
      lowerInput.includes('查找')
    ) {
      updateMessage(messageId, `我会先帮你定位相关文件。

<tool_use>
<tool name="grep">
<tool_params>{"pattern": "React", "path": "/src", "include": "*.tsx"}</tool_params>
</tool>
</tool_use>

可能相关的文件有：
- src/App.tsx
- src/components/ai/AIPanel.tsx
- src/components/canvas/Canvas.tsx
- src/components/product/ProductWorkbench.tsx
- src/components/feature-tree/FeatureTree.tsx

如果你愿意，我可以继续帮你缩小到某个模块。`);
    } else if (
      lowerInput.includes('run') ||
      lowerInput.includes('command') ||
      lowerInput.includes('执行') ||
      lowerInput.includes('npm')
    ) {
      updateMessage(messageId, `可以，下面是一次示例执行结果。

<tool_use>
<tool name="bash">
<tool_params>{"command": "npm run build", "timeout": 120000}</tool_params>
</tool>
</tool_use>

<tool_result>
Simulated: npm run build

144 modules transformed.
dist/index.html                   0.47 kB
dist/assets/index.css           16.21 kB
dist/assets/index.js           613.39 kB

Build completed successfully.
</tool_result>

如果你要执行真实命令，也可以直接告诉我。`);
    } else if (
      lowerInput.includes('explain') ||
      lowerInput.includes('解释') ||
      lowerInput.includes('什么是')
    ) {
      updateMessage(messageId, `从当前代码结构看，这个项目的核心分层是：

- Components：界面层，包含 AI、画布、产品、工作区等模块
- Modules：底层能力，比如 AI 服务和范围检测
- Store：状态管理，基于 Zustand
- Types：统一类型定义

关键技术栈：
- React 19 + TypeScript
- Zustand
- Vite
- Tauri

如果你指定某个文件或功能点，我可以继续往下解释。`);
    } else if (
      lowerInput.includes('list') ||
      lowerInput.includes('ls') ||
      lowerInput.includes('目录')
    ) {
      updateMessage(messageId, `<tool_use>
<tool name="ls">
<tool_params>{"path": "/src"}</tool_params>
</tool>
</tool_use>

<tool_result>
/src/
  components/
  modules/
  store/
  types/
  App.tsx
  main.tsx
</tool_result>

这是当前项目结构的简化预览。想看哪个目录，我可以继续展开。`);
    } else {
      updateMessage(messageId, `我理解你的目标是：“${userInput}”

我现在可以直接帮你做这些事：

1. 写一个组件或页面
2. 搜索相关文件
3. 运行构建或检查命令
4. 解释某段代码
5. 定位某个 bug

你也可以直接说“先帮我找相关文件”。`);
    }
  };

  const appendToMessage = (messageId: string, content: string) => {
    setMessages((prev) => prev.map((msg) =>
      msg.id === messageId ? { ...msg, content: msg.content + content } : msg
    ));
  };

  const updateMessage = (messageId: string, content: string) => {
    setMessages((prev) => prev.map((msg) =>
      msg.id === messageId ? { ...msg, content } : msg
    ));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInjectContext = () => {
    onContextInject?.('User requested context injection from chat');
  };

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <div className="chat-model">
          <span className="model-badge">{provider}</span>
          <span className="model-name">{model}</span>
        </div>
        <div className="chat-actions">
          <button className="chat-action-btn" onClick={handleInjectContext} title="注入上下文" type="button">
            +
          </button>
          <button className="chat-action-btn" title="清空对话" type="button">
            C
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' && '我'}
              {msg.role === 'assistant' && 'AI'}
              {msg.role === 'tool' && 'T'}
              {msg.role === 'system' && 'S'}
            </div>
            <div className="message-content">
              <div className="message-text">
                {formatMessageContent(msg.content)}
              </div>
              <div className="message-time">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="message-avatar">AI</div>
            <div className="message-content">
              <div className="message-text typing">
                <span className="typing-dot">•</span>
                <span className="typing-dot">•</span>
                <span className="typing-dot">•</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="chat-input-container">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想完成的开发任务..."
            className="chat-input"
            rows={1}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!input.trim() || isLoading}
          >
            发送
          </button>
        </div>
        <div className="chat-tools">
          <button type="button" className="tool-btn" title="插入代码">
            {'</>'}
          </button>
          <button type="button" className="tool-btn" title="附加文件">
            F
          </button>
          <button type="button" className="tool-btn" title="注入上下文">
            +
          </button>
        </div>
      </form>

      {!isConfigured && (
        <div className="api-warning">
          完成 AI 设置中的 API Key、Base URL 和 Model 后，就可以启用真实 AI 响应。
        </div>
      )}
    </div>
  );
};

function formatMessageContent(content: string): React.ReactNode {
  if (!content) return null;

  const parts: React.ReactNode[] = [];
  let key = 0;

  const lines = content.split('\n');
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let toolCallBlock = false;
  let toolResultBlock = false;

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        parts.push(
          <pre key={key++} className="code-block">
            <code>{codeContent.join('\n')}</code>
          </pre>
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
    } else if (line.startsWith('<tool_call>')) {
      toolCallBlock = true;
      codeContent = [];
    } else if (line.startsWith('</tool_call>')) {
      toolCallBlock = false;
      parts.push(
        <pre key={key++} className="tool-call">
          <code>{codeContent.join('\n')}</code>
        </pre>
      );
      codeContent = [];
    } else if (line.startsWith('<tool_result')) {
      toolResultBlock = true;
      codeContent = [];
    } else if (line.startsWith('</tool_result>')) {
      toolResultBlock = false;
      parts.push(
        <pre key={key++} className="tool-result">
          <code>{codeContent.join('\n')}</code>
        </pre>
      );
      codeContent = [];
    } else if (inCodeBlock) {
      codeContent.push(line);
    } else if (toolCallBlock || toolResultBlock) {
      codeContent.push(line);
    } else {
      parts.push(
        <div key={key++} className="text-line">
          {line || '\u00A0'}
        </div>
      );
    }
  });

  return parts;
}
