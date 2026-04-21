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
      content: `◎ AI Coding Assistant ready.

I can help you with:
• Writing and editing code
• Searching files (grep, glob)
• Viewing and navigating code
• Running terminal commands
• Explaining code logic

Type your request or select code to get started.`,
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

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Use AI or simulate based on configuration
      if (isConfigured) {
        await processAIResponse(userMessage.content, assistantMessage.id);
      } else {
        await simulateResponse(userMessage.content, assistantMessage.id);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
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

  // Original simulation for demo mode
  const simulateResponse = async (userInput: string, messageId: string) => {
    const lowerInput = userInput.toLowerCase();

    if (lowerInput.includes('write') || lowerInput.includes('create') || lowerInput.includes('生成') || lowerInput.includes('写')) {
      updateMessage(messageId, `I'll help you write code. Let me create a new file with the requested functionality.

<tool_use>
<tool name="write">
<tool_params>{"file_path": "src/generated/Component.tsx", "content": "import React from 'react';\n\nexport const GeneratedComponent: React.FC = () => {\n  return (\n    <div className=\"generated\">\n      <h2>AI Generated Component</h2>\n      <p>Your custom component code here</p>\n    </div>\n  );\n};\n"}</tool_params>
</tool>
</tool_use>

File created: src/generated/Component.tsx

The component has been generated. You can:
• View the file in the editor
• Edit if needed
• Run it to test`);

    } else if (lowerInput.includes('search') || lowerInput.includes('find') || lowerInput.includes('找')) {
      updateMessage(messageId, `Searching for relevant files...

<tool_use>
<tool name="grep">
<tool_params>{"pattern": "React", "path": "/src", "include": "*.tsx"}</tool_params>
</tool>
</tool_use>

Found 12 files containing "React":
• src/App.tsx
• src/components/ai/AIPanel.tsx
• src/components/canvas/Canvas.tsx
• src/components/editor/CodeEditor.tsx
• src/components/feature-tree/FeatureTree.tsx

Use glob to find specific file types or view to examine any of these files.`);

    } else if (lowerInput.includes('run') || lowerInput.includes('command') || lowerInput.includes('执行') || lowerInput.includes('npm')) {
      updateMessage(messageId, `Executing command...

<tool_use>
<tool name="bash">
<tool_params>{"command": "npm run build", "timeout": 120000}</tool_params>
</tool>
</tool_use>

<tool_result>
Simulated: npm run build

✓ 144 modules transformed.
dist/index.html                   0.47 kB
dist/assets/index.css   16.21 kB
dist/assets/index.js   613.39 kB

Build completed successfully.
</tool_result>

Build finished successfully!`);

    } else if (lowerInput.includes('explain') || lowerInput.includes('解释') || lowerInput.includes('什么是')) {
      updateMessage(messageId, `Based on the code analysis:

**Component Structure:**
The codebase follows a modular architecture with:
- **Components**: UI elements (ai, canvas, editor, feature-tree)
- **Modules**: Core services (ai, scope-detector)
- **Store**: State management (Zustand)
- **Types**: TypeScript definitions

**Key Technologies:**
• React 18 with TypeScript
• Zustand for state management
• Vite for bundling
• Tauri for desktop deployment

**AI Integration:**
The GlobalAIStore manages AI requests across all modules, providing:
• Streaming responses
• Code block generation
• Context-aware prompts

Would you like me to dive deeper into any specific area?`);

    } else if (lowerInput.includes('list') || lowerInput.includes('ls') || lowerInput.includes('目录')) {
      updateMessage(messageId, `<tool_use>
<tool name="ls">
<tool_params>{"path": "/src"}</tool_params>
</tool>
</tool_use>

<tool_result>
/src/
├── components/
│   ├── ai/
│   ├── canvas/
│   ├── editor/
│   ├── feature-tree/
│   └── workspace/
├── modules/
│   ├── ai/
│   └── scope-detector/
├── store/
├── types/
├── App.tsx
└── main.tsx
</tool_result>

Project structure overview. Would you like to explore any specific directory?`);

    } else {
      updateMessage(messageId, `I understand you want to: "${userInput}"

I can help you with:

1. **Writing Code** - Just say "write a login form" or "create a user component"
2. **Searching** - Try "find files with React" or "search for useState"
3. **Running Commands** - "run npm install" or "execute git status"
4. **Explaining** - "explain how the AI integration works"
5. **Viewing Files** - "show me the App.tsx file"

What would you like to do?`);
    }
  };

  const appendToMessage = (messageId: string, content: string) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, content: msg.content + content } : msg
    ));
  };

  const updateMessage = (messageId: string, content: string) => {
    setMessages(prev => prev.map(msg =>
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
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-model">
          <span className="model-badge">{provider}</span>
          <span className="model-name">{model}</span>
        </div>
        <div className="chat-actions">
          <button className="chat-action-btn" onClick={handleInjectContext} title="Inject Context">
            ◎
          </button>
          <button className="chat-action-btn" title="Clear Chat">
            🗑️
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' && '👤'}
              {msg.role === 'assistant' && '◎'}
              {msg.role === 'tool' && '⚙️'}
              {msg.role === 'system' && 'ℹ️'}
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
            <div className="message-avatar">◎</div>
            <div className="message-content">
              <div className="message-text typing">
                <span className="typing-dot">●</span>
                <span className="typing-dot">●</span>
                <span className="typing-dot">●</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="chat-input-container">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI or describe what you want to build..."
            className="chat-input"
            rows={1}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!input.trim() || isLoading}
          >
            ▶
          </button>
        </div>
        <div className="chat-tools">
          <button type="button" className="tool-btn" title="Insert Code">📝</button>
          <button type="button" className="tool-btn" title="Attach File">📎</button>
          <button type="button" className="tool-btn" title="Inject Context">◎</button>
        </div>
      </form>

      {/* API Key Warning */}
      {!isConfigured && (
        <div className="api-warning">
          ⚠️ 在 AI 设置中填写第三方 API Key / Base URL / Model 后，即可启用真实 AI 响应
        </div>
      )}
    </div>
  );
};

// Format message content with code blocks
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
