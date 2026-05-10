import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryState = {
    hasError: boolean;
    error: string;
};

type ErrorBoundaryProps = {
    children: ReactNode;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: '', hasError: false };

    static getDerivedStateFromError(err: Error): ErrorBoundaryState {
        return { error: err.message, hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
                    <div className="flex max-w-md flex-col items-center gap-3 px-4 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <span className="font-bold text-destructive text-xl">!</span>
                        </div>
                        <h2 className="font-semibold text-foreground text-sm">Something went wrong</h2>
                        <p className="break-all font-mono text-muted-foreground text-xs">{this.state.error}</p>
                        <button
                            type="button"
                            onClick={() => this.setState({ error: '', hasError: false })}
                            className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90"
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
