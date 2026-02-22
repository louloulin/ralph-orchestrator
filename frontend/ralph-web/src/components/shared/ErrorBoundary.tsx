/**
 * ErrorBoundary Component
 *
 * React error boundary that catches JavaScript errors anywhere in the child
 * component tree, logs those errors, and displays a fallback UI instead of
 * crashing the whole application.
 *
 * Features:
 * - Catches errors in child component tree
 * - Displays user-friendly error message
 * - Provides retry mechanism
 * - Logs error details for debugging
 * - Shows error ID for support purposes
 */

import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Generate a unique error ID for tracking
 */
function generateErrorId(): string {
  return `err-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Props for the ErrorBoundary component
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback component */
  fallback?: ReactNode;
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional className for the error UI */
  className?: string;
  /** Show detailed error info in development */
  showDetails?: boolean;
}

/**
 * State for the ErrorBoundary component
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

/**
 * ErrorBoundary Component
 *
 * Wraps children and catches any errors that bubble up.
 * Displays a friendly error UI with retry options.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Store error info
    this.setState({ errorInfo });

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught an error:", error);
      console.error("Component stack:", errorInfo.componentStack);
    }

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  handleGoHome = (): void => {
    window.location.href = "/dashboard";
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, errorId } = this.state;
    const { children, fallback, className, showDetails = import.meta.env.DEV } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div
          className={cn(
            "flex items-center justify-center min-h-[400px] p-6",
            className
          )}
        >
          <div className="max-w-md w-full space-y-6 text-center">
            {/* Error icon */}
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-destructive/10">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>

            {/* Error message */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-muted-foreground text-sm">
                An unexpected error occurred. Please try again or contact support if the problem persists.
              </p>
            </div>

            {/* Error ID */}
            {errorId && (
              <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                Error ID: <code className="font-mono">{errorId}</code>
              </div>
            )}

            {/* Error details (development only) */}
            {showDetails && error && (
              <details className="text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Bug className="h-4 w-4 inline mr-1" />
                  View error details
                </summary>
                <div className="mt-2 p-3 bg-muted rounded-md overflow-auto max-h-48">
                  <p className="text-sm font-medium text-destructive mb-2">
                    {error.name}: {error.message}
                  </p>
                  {errorInfo?.componentStack && (
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
                  "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <Home className="h-4 w-4" />
                Go to Dashboard
              </button>
            </div>

            {/* Reload hint */}
            <p className="text-xs text-muted-foreground">
              If the problem persists, try{" "}
              <button
                onClick={this.handleReload}
                className="underline hover:text-foreground transition-colors"
              >
                reloading the page
              </button>
            </p>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Lightweight inline error fallback for smaller components
 */
export function InlineErrorFallback({
  message = "Failed to load",
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}): ReactNode {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 p-4 rounded-md bg-muted/50",
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-primary hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;
