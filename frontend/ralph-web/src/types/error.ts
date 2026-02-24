/**
 * Error Types
 *
 * Classification system for errors in the Ralph Web Dashboard.
 * Provides structured error types and categorization for better error handling.
 */

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | "network"      // API/fetch errors
  | "validation"   // Form/input validation errors
  | "auth"         // Authentication/authorization errors
  | "resource"     // Missing/not found resources
  | "system"       // System/internal errors
  | "user"         // User-initiated errors
  | "timeout"      // Request timeout errors
  | "rate-limit"   // API rate limit errors
  | "unknown";     // Uncategorized errors

/**
 * Error severity levels
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * Application error class
 */
export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code?: string;
  public readonly metadata?: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly id: string;

  constructor(
    message: string,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      code?: string;
      metadata?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    // Construct the base Error with cause
    super(message, { cause: options.cause });

    this.name = "AppError";
    this.category = options.category ?? "unknown";
    this.severity = options.severity ?? "medium";
    this.code = options.code;
    this.metadata = options.metadata;
    this.recoverable = options.recoverable ?? true;
    this.id = generateErrorId();

    // Ensure cause is set (for environments where it might not be)
    if (options.cause && !(this as { cause?: unknown }).cause) {
      (this as { cause: unknown }).cause = options.cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Generate unique error ID
 */
function generateErrorId(): string {
  return `err-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Error classification utilities
 */
export const ErrorClassifier = {
  /**
   * Classify an error based on its properties
   */
  classify(error: Error | AppError | unknown): ErrorCategory {
    if (error instanceof AppError) {
      return error.category;
    }

    if (!(error instanceof Error)) {
      return "system";
    }

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (
      name.includes("network") ||
      name.includes("fetch") ||
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    ) {
      return "network";
    }

    // Timeout errors
    if (message.includes("timeout") || message.includes("aborted")) {
      return "timeout";
    }

    // Rate limit errors
    if (message.includes("rate limit") || message.includes("429")) {
      return "rate-limit";
    }

    // Authentication errors
    if (
      message.includes("unauthorized") ||
      message.includes("401") ||
      message.includes("403") ||
      message.includes("forbidden")
    ) {
      return "auth";
    }

    // Resource errors
    if (
      message.includes("not found") ||
      message.includes("404") ||
      message.includes("no such")
    ) {
      return "resource";
    }

    // Validation errors
    if (
      message.includes("validation") ||
      message.includes("invalid") ||
      message.includes("required")
    ) {
      return "validation";
    }

    // Default to unknown
    return "unknown";
  },

  /**
   * Determine error severity
   */
  getSeverity(error: Error | AppError | unknown): ErrorSeverity {
    if (error instanceof AppError) {
      return error.severity;
    }

    if (!(error instanceof Error)) {
      return "critical";
    }

    const message = error.message.toLowerCase();

    // Critical errors
    if (message.includes("critical") || message.includes("fatal")) {
      return "critical";
    }

    // High severity
    if (message.includes("database") || message.includes("corruption")) {
      return "high";
    }

    // Low severity
    if (message.includes("not found") || message.includes("warning")) {
      return "low";
    }

    // Default to medium
    return "medium";
  },

  /**
   * Create a toast notification for an error
   */
  toToast(error: Error | AppError | unknown): {
    type: "error" | "warning" | "info";
    title: string;
    message?: string;
    duration: number;
  } {
    const category = this.classify(error);
    const severity = this.getSeverity(error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Determine toast type based on severity
    let type: "error" | "warning" | "info" = "error";
    if (severity === "low") type = "info";
    if (severity === "medium") type = "warning";

    // Generate title based on category
    const titles: Record<ErrorCategory, string> = {
      network: "Network Error",
      validation: "Validation Error",
      auth: "Authentication Error",
      resource: "Resource Not Found",
      system: "System Error",
      user: "Error",
      timeout: "Request Timeout",
      "rate-limit": "Rate Limit Exceeded",
      unknown: "Error",
    };

    // Adjust duration based on severity
    const durations: Record<ErrorSeverity, number> = {
      low: 3000,
      medium: 5000,
      high: 7000,
      critical: 10000,
    };

    return {
      type,
      title: titles[category],
      message: severity === "low" ? errorMessage : undefined,
      duration: durations[severity],
    };
  },

  /**
   * Wrap an error in an AppError instance
   */
  wrap(error: Error | unknown, options?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    code?: string;
    metadata?: Record<string, unknown>;
    recoverable?: boolean;
  }): AppError {
    if (error instanceof AppError) {
      // Return existing AppError if no new options provided
      if (!options) return error;
      // Create new AppError with combined options
      return new AppError(error.message, {
        category: options.category ?? error.category,
        severity: options.severity ?? error.severity,
        code: options.code ?? error.code,
        metadata: { ...error.metadata, ...options.metadata },
        recoverable: options.recoverable ?? error.recoverable,
        cause: error,
      });
    }

    if (error instanceof Error) {
      return new AppError(error.message, {
        category: options?.category ?? this.classify(error),
        severity: options?.severity ?? this.getSeverity(error),
        code: options?.code,
        metadata: options?.metadata,
        recoverable: options?.recoverable,
        cause: error,
      });
    }

    return new AppError("Unknown error occurred", {
      category: "system",
      severity: "high",
      recoverable: false,
    });
  },
};

/**
 * Common error codes
 */
export const ErrorCodes = {
  // Network errors
  NETWORK_ERROR: "NETWORK_ERROR",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  NETWORK_OFFLINE: "NETWORK_OFFLINE",

  // Auth errors
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  SESSION_EXPIRED: "SESSION_EXPIRED",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  GONE: "GONE",

  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  REQUIRED_FIELD: "REQUIRED_FIELD",

  // System errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];