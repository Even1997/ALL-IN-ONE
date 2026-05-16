// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderRadius: "14px",
        background:
          "radial-gradient(circle at 14% 12%, rgba(59, 130, 246, 0.12), transparent 28%), radial-gradient(circle at 84% 12%, rgba(20, 184, 166, 0.1), transparent 24%), linear-gradient(180deg, #edf2f8 0%, #f6f8fb 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        color: "#162033",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "28px 32px",
          borderRadius: "22px",
          background: "rgba(255, 255, 255, 0.72)",
          border: "1px solid rgba(100, 116, 139, 0.08)",
          boxShadow: "0 20px 48px rgba(71, 85, 105, 0.12)",
          backdropFilter: "blur(24px) saturate(160%)",
        }}
      >
        <img
          src="/branding/goodnight-icon.svg"
          alt="GoodNight"
          style={{ width: "88px", height: "88px", margin: "0 auto 14px", display: "block" }}
        />
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#516074" }}>GoodNight 加载中...</div>
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
        overflow: "hidden",
        borderRadius: "14px",
        background:
          "radial-gradient(circle at 12% 10%, rgba(59, 130, 246, 0.12), transparent 28%), radial-gradient(circle at 84% 12%, rgba(249, 115, 22, 0.12), transparent 24%), linear-gradient(180deg, #f6f1eb 0%, #fbf7f2 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        color: "#7c2d12",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          background: "rgba(255, 255, 255, 0.78)",
          border: "1px solid rgba(251, 146, 60, 0.22)",
          borderRadius: "20px",
          boxShadow: "0 24px 56px rgba(124, 45, 18, 0.14)",
          backdropFilter: "blur(24px) saturate(160%)",
          padding: "28px",
        }}
      >
        <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "8px" }}>
          GoodNight 运行时错误
        </div>
        <div style={{ fontSize: "15px", lineHeight: 1.7, marginBottom: "18px", color: "#9a3412" }}>
          页面没有正常渲染，当前捕获到的首个异常如下。
        </div>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "rgba(255, 250, 245, 0.82)",
            border: "1px solid rgba(251, 146, 60, 0.14)",
            borderRadius: "14px",
            padding: "18px",
            fontSize: "13.5px",
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
    console.error("[GoodNight] React render error:", error);
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
      console.log('[GoodNight] hydrated, rendering App');
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
      console.error("[GoodNight] Uncaught error:", nextError);
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
      console.error("[GoodNight] Unhandled rejection:", nextError);
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
