import { Component, type ErrorInfo, type PropsWithChildren } from "react";

import { ErrorState } from "../error-state/ErrorState";

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<PropsWithChildren, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    window.dispatchEvent(
      new CustomEvent("procuredesk:workspace-error", {
        detail: {
          componentStack: info.componentStack,
          message: error.message,
          stack: error.stack,
        },
      }),
    );
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="workspace-error-shell">
          <ErrorState
            message={this.state.error.message || "Refresh the page and try again."}
            title="Workspace error"
          />
        </main>
      );
    }

    return this.props.children;
  }
}
