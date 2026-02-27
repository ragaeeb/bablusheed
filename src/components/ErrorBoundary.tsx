import { Component, type ReactNode } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: "" };

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { hasError: true, error: err.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 bg-background text-foreground">
          <div className="flex flex-col items-center gap-3 max-w-md text-center px-4">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <span className="text-destructive text-xl font-bold">!</span>
            </div>
            <h2 className="text-sm font-semibold text-foreground">Something went wrong</h2>
            <p className="text-xs text-muted-foreground font-mono break-all">{this.state.error}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: "" })}
              className="inline-flex items-center gap-2 h-8 px-4 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
