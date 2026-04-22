import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

type RuntimeErrorDetails = {
  message: string;
  stack?: string;
  source?: string;
};

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f7',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      color: '#1d1d1f',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚡</div>
        <div style={{ fontSize: '14px', color: '#666' }}>DevFlow 加载中...</div>
      </div>
    </div>
  );
}

function RuntimeErrorScreen({ error }: { error: RuntimeErrorDetails }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff7ed",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        color: "#7c2d12",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          background: "#ffffff",
          border: "1px solid #fdba74",
          borderRadius: "16px",
          boxShadow: "0 16px 50px rgba(124, 45, 18, 0.12)",
          padding: "24px",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
          DevFlow 运行时错误
        </div>
        <div style={{ fontSize: "14px", lineHeight: 1.6, marginBottom: "16px" }}>
          页面没有正常渲染，当前捕获到的首个异常如下。
        </div>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#fffaf5",
            borderRadius: "12px",
            padding: "16px",
            fontSize: "13px",
            lineHeight: 1.6,
            overflow: "auto",
          }}
        >
{`Message: ${error.message}
Source: ${error.source || "unknown"}

${error.stack || "No stack trace available."}`}
        </pre>
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: RuntimeErrorDetails | null }
> {
  state = { error: null as RuntimeErrorDetails | null };

  static getDerivedStateFromError(error: Error) {
    return {
      error: {
        message: error.message,
        stack: error.stack,
        source: "react-render",
      },
    };
  }

  componentDidCatch(error: Error) {
    console.error("[DevFlow] React render error:", error);
  }

  render() {
    if (this.state.error) {
      return <RuntimeErrorScreen error={this.state.error} />;
    }

    return this.props.children;
  }
}

function Root() {
  const [hydrated, setHydrated] = useState(false);
  const [runtimeError, setRuntimeError] = useState<RuntimeErrorDetails | null>(null);

  useEffect(() => {
    // Small delay to ensure zustand persist rehydrates from localStorage
    const timer = setTimeout(() => {
      console.log('[DevFlow] hydrated, rendering App');
      setHydrated(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const nextError = {
        message: event.message || "Unknown runtime error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: event.filename || "window.onerror",
      };
      console.error("[DevFlow] Uncaught error:", nextError);
      setRuntimeError((current) => current || nextError);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const nextError = {
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : JSON.stringify(reason, null, 2),
        stack: reason instanceof Error ? reason.stack : undefined,
        source: "unhandledrejection",
      };
      console.error("[DevFlow] Unhandled rejection:", nextError);
      setRuntimeError((current) => current || nextError);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (runtimeError) {
    return <RuntimeErrorScreen error={runtimeError} />;
  }

  if (!hydrated) {
    return <LoadingScreen />;
  }

  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
