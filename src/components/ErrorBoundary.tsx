import React from "react";

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center min-h-screen bg-app-bg">
          <div className="text-center max-w-sm px-6">
            <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-app-error-bg ring-1 ring-app-error-ring flex items-center justify-center">
              <span className="text-2xl">!</span>
            </div>
            <h2 className="text-lg font-medium text-app-text-secondary mb-2">出错了</h2>
            <p className="text-sm text-app-text-tertiary leading-relaxed">
              {this.state.error?.message || "应用遇到意外错误，请刷新页面重试。"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-5 px-4 py-2 rounded-xl bg-app-btn hover:bg-app-btn-hover text-app-text text-sm transition-all"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
