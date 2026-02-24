/**
 * Error Types Tests
 */

import { describe, it, expect } from "vitest";
import {
  AppError,
  ErrorClassifier,
  ErrorCodes,
  type ErrorCategory,
  type ErrorSeverity,
} from "../error";

describe("AppError", () => {
  it("should create an AppError with default values", () => {
    const error = new AppError("Test error");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("AppError");
    expect(error.message).toBe("Test error");
    expect(error.category).toBe("unknown");
    expect(error.severity).toBe("medium");
    expect(error.recoverable).toBe(true);
    expect(error.id).toMatch(/^err-\d+-[a-z0-9]+$/);
  });

  it("should accept custom options", () => {
    const error = new AppError("Custom error", {
      category: "network",
      severity: "high",
      code: "NET_001",
      metadata: { url: "/api/test" },
      recoverable: false,
    });

    expect(error.category).toBe("network");
    expect(error.severity).toBe("high");
    expect(error.code).toBe("NET_001");
    expect(error.metadata).toEqual({ url: "/api/test" });
    expect(error.recoverable).toBe(false);
  });

  it("should preserve cause", () => {
    const cause = new Error("Original error");
    const error = new AppError("Wrapped error", { cause });

    expect(error.cause).toBe(cause);
  });
});

describe("ErrorClassifier", () => {
  describe("classify", () => {
    it("should return category from AppError", () => {
      const error = new AppError("Test", { category: "auth" });
      expect(ErrorClassifier.classify(error)).toBe("auth");
    });

    it("should classify network errors", () => {
      const networkErrors: Array<{ name?: string; message: string }> = [
        { name: "NetworkError", message: "" },
        { name: "TypeError", message: "fetch failed" },
        { message: "ECONNREFUSED" },
        { message: "ENOTFOUND" },
      ];

      networkErrors.forEach(({ name, message }) => {
        const error = new Error(message);
        if (name) error.name = name;
        expect(ErrorClassifier.classify(error)).toBe("network");
      });
    });

    it("should classify timeout errors", () => {
      const errors = [
        new Error("Request timeout"),
        new Error("Operation aborted"),
      ];

      errors.forEach((error) => {
        expect(ErrorClassifier.classify(error)).toBe("timeout");
      });
    });

    it("should classify rate limit errors", () => {
      const error = new Error("Rate limit exceeded: 429");
      expect(ErrorClassifier.classify(error)).toBe("rate-limit");
    });

    it("should classify auth errors", () => {
      const errors = [
        new Error("Unauthorized: 401"),
        new Error("Forbidden: 403"),
      ];

      errors.forEach((error) => {
        expect(ErrorClassifier.classify(error)).toBe("auth");
      });
    });

    it("should classify resource errors", () => {
      const errors = [
        new Error("Not found: 404"),
        new Error("No such file or directory"),
      ];

      errors.forEach((error) => {
        expect(ErrorClassifier.classify(error)).toBe("resource");
      });
    });

    it("should classify validation errors", () => {
      const errors = [
        new Error("Validation failed"),
        new Error("Invalid input"),
        new Error("Required field missing"),
      ];

      errors.forEach((error) => {
        expect(ErrorClassifier.classify(error)).toBe("validation");
      });
    });

    it("should return unknown for unclassifiable errors", () => {
      const error = new Error("Something weird happened");
      expect(ErrorClassifier.classify(error)).toBe("unknown");
    });

    it("should return system for non-Error values", () => {
      expect(ErrorClassifier.classify(null)).toBe("system");
      expect(ErrorClassifier.classify(undefined)).toBe("system");
      expect(ErrorClassifier.classify("string error")).toBe("system");
    });
  });

  describe("getSeverity", () => {
    it("should return severity from AppError", () => {
      const error = new AppError("Test", { severity: "critical" });
      expect(ErrorClassifier.getSeverity(error)).toBe("critical");
    });

    it("should return critical for critical messages", () => {
      const error = new Error("Critical failure");
      expect(ErrorClassifier.getSeverity(error)).toBe("critical");
    });

    it("should return critical for non-Error values", () => {
      expect(ErrorClassifier.getSeverity(null)).toBe("critical");
    });

    it("should return high for database errors", () => {
      const error = new Error("Database corruption detected");
      expect(ErrorClassifier.getSeverity(error)).toBe("high");
    });

    it("should return low for not found warnings", () => {
      const error = new Error("Warning: not found");
      expect(ErrorClassifier.getSeverity(error)).toBe("low");
    });

    it("should return medium by default", () => {
      const error = new Error("Some error occurred");
      expect(ErrorClassifier.getSeverity(error)).toBe("medium");
    });
  });

  describe("toToast", () => {
    it("should convert AppError to toast", () => {
      const error = new AppError("Network failed", { category: "network" });
      const toast = ErrorClassifier.toToast(error);

      expect(toast.type).toBe("warning"); // medium severity
      expect(toast.title).toBe("Network Error");
      expect(toast.duration).toBe(5000); // medium duration
    });

    it("should use info type for low severity", () => {
      const error = new AppError("Not found", {
        category: "resource",
        severity: "low",
      });
      const toast = ErrorClassifier.toToast(error);

      expect(toast.type).toBe("info");
      expect(toast.duration).toBe(3000);
    });

    it("should use error type for high/critical severity", () => {
      const error = new AppError("Critical failure", {
        severity: "critical",
      });
      const toast = ErrorClassifier.toToast(error);

      expect(toast.type).toBe("error");
      expect(toast.duration).toBe(10000);
    });

    it("should include message for low severity", () => {
      const error = new Error("Warning: item not found");
      const toast = ErrorClassifier.toToast(error);

      expect(toast.message).toBe("Warning: item not found");
    });
  });

  describe("wrap", () => {
    it("should return existing AppError if no options", () => {
      const error = new AppError("Test", { category: "auth" });
      const wrapped = ErrorClassifier.wrap(error);

      expect(wrapped).toBe(error);
    });

    it("should create new AppError with combined options", () => {
      const error = new AppError("Test", {
        category: "auth",
        metadata: { original: true },
      });
      const wrapped = ErrorClassifier.wrap(error, {
        severity: "high",
        metadata: { additional: true },
      });

      expect(wrapped.category).toBe("auth");
      expect(wrapped.severity).toBe("high");
      expect(wrapped.metadata).toEqual({ original: true, additional: true });
      expect(wrapped.cause).toBe(error);
    });

    it("should wrap regular Error with classified options", () => {
      const error = new Error("Network failed");
      const wrapped = ErrorClassifier.wrap(error);

      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.category).toBe("network");
      expect(wrapped.cause).toBe(error);
    });

    it("should wrap non-Error values", () => {
      const wrapped = ErrorClassifier.wrap(null);

      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.message).toBe("Unknown error occurred");
      expect(wrapped.category).toBe("system");
      expect(wrapped.severity).toBe("high");
      expect(wrapped.recoverable).toBe(false);
    });
  });
});

describe("ErrorCodes", () => {
  it("should have network error codes", () => {
    expect(ErrorCodes.NETWORK_ERROR).toBe("NETWORK_ERROR");
    expect(ErrorCodes.NETWORK_TIMEOUT).toBe("NETWORK_TIMEOUT");
    expect(ErrorCodes.NETWORK_OFFLINE).toBe("NETWORK_OFFLINE");
  });

  it("should have auth error codes", () => {
    expect(ErrorCodes.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(ErrorCodes.FORBIDDEN).toBe("FORBIDDEN");
    expect(ErrorCodes.SESSION_EXPIRED).toBe("SESSION_EXPIRED");
  });

  it("should have resource error codes", () => {
    expect(ErrorCodes.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCodes.GONE).toBe("GONE");
  });

  it("should have validation error codes", () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCodes.INVALID_INPUT).toBe("INVALID_INPUT");
    expect(ErrorCodes.REQUIRED_FIELD).toBe("REQUIRED_FIELD");
  });

  it("should have system error codes", () => {
    expect(ErrorCodes.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(ErrorCodes.UNKNOWN_ERROR).toBe("UNKNOWN_ERROR");
  });
});
