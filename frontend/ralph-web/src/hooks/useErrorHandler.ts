/**
 * React Hook for Error Handling
 *
 * Provides convenient integration with the error handler for React components.
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { errorHandler, type ErrorHandlerOptions } from "@/lib/errorHandler";
import type { AppError } from "@/types/error";

/**
 * Hook return type
 */
interface UseErrorHandlerReturn {
  /**
   * Handle an error with automatic classification and notification
   */
  handle: (error: Error | unknown, options?: ErrorHandlerOptions) => AppError;

  /**
   * Wrap an async function with error handling
   */
  wrapAsync: <T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T
  ) => (...args: Parameters<T>) => Promise<ReturnType<T>>;

  /**
   * Execute an async function with loading state and error handling
   */
  execute: <T>(
    fn: () => Promise<T>,
    options?: ErrorHandlerOptions
  ) => Promise<T | null>;

  /**
   * Current error if one occurred
   */
  error: AppError | null;

  /**
   * Clear the current error
   */
  clearError: () => void;

  /**
   * Whether an async operation is in progress
   */
  isLoading: boolean;
}

/**
 * Hook for error handling in React components
 */
export function useErrorHandler(defaultOptions?: ErrorHandlerOptions): UseErrorHandlerReturn {
  const [error, setError] = useState<AppError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const defaultOptionsRef = useRef(defaultOptions);

  // Keep default options ref updated
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only want to update ref when options change
  useEffect(() => {
    defaultOptionsRef.current = defaultOptions;
  }, [defaultOptions]);

  const handle = useCallback(
    (error: Error | unknown, options?: ErrorHandlerOptions): AppError => {
      const appError = errorHandler.handle(error, {
        ...defaultOptionsRef.current,
        ...options,
        showToast: options?.showToast ?? defaultOptionsRef.current?.showToast ?? true,
        logError: options?.logError ?? defaultOptionsRef.current?.logError ?? true,
      });
      setError(appError);
      return appError;
    },
    []
  );

  const wrapAsync = useCallback(
    <T extends (...args: unknown[]) => Promise<unknown>>(
      fn: T
    ): ((...args: Parameters<T>) => Promise<ReturnType<T>>) => {
      return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
        setIsLoading(true);
        setError(null);
        try {
          const result = await fn(...args);
          return result as ReturnType<T>;
        } catch (error) {
          handle(error);
          throw error;
        } finally {
          setIsLoading(false);
        }
      };
    },
    [handle]
  );

  const execute = useCallback(
    async <T>(fn: () => Promise<T>, options?: ErrorHandlerOptions): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fn();
        return result;
      } catch (error) {
        handle(error, options);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [handle]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    handle,
    wrapAsync,
    execute,
    error,
    clearError,
    isLoading,
  };
}

/**
 * Hook for handling errors in async operations with automatic retry
 */
interface UseAsyncOptions<T> extends ErrorHandlerOptions {
  /**
   * Whether to execute the function immediately on mount
   * @default false
   */
  immediate?: boolean;

  /**
   * Number of retry attempts
   * @default 0
   */
  retryAttempts?: number;

  /**
   * Delay between retries in milliseconds
   * @default 1000
   */
  retryDelay?: number;

  /**
   * Callback when the operation succeeds
   */
  onSuccess?: (data: T) => void;

  /**
   * Callback when the operation fails
   */
  onError?: (error: AppError) => void;
}

interface UseAsyncResult<T> {
  /**
   * The data returned from the async operation
   */
  data: T | null;

  /**
   * The error if one occurred
   */
  error: AppError | null;

  /**
   * Whether the operation is in progress
   */
  isLoading: boolean;

  /**
   * Whether the operation has completed
   */
  isSettled: boolean;

  /**
   * Re-execute the async operation
   */
  execute: () => Promise<void>;

  /**
   * Reset the state
   */
  reset: () => void;
}

/**
 * Hook for async operations with error handling and retry
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  options: UseAsyncOptions<T> = {}
): UseAsyncResult<T> {
  const {
    immediate = false,
    retryAttempts = 0,
    retryDelay = 1000,
    onSuccess,
    onError,
    ...errorOptions
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettled, setIsSettled] = useState(false);
  const retryCountRef = useRef(0);

  const execute = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setIsSettled(false);

    const tryExecute = async (): Promise<void> => {
      try {
        const result = await asyncFn();
        setData(result);
        setError(null);
        setIsSettled(true);
        retryCountRef.current = 0;
        onSuccess?.(result);
      } catch (err) {
        const appError = errorHandler.handle(err, errorOptions);
        setError(appError);
        setIsSettled(true);
        onError?.(appError);

        // Retry if attempts remaining
        if (retryCountRef.current < retryAttempts) {
          retryCountRef.current++;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          await tryExecute();
        }
      } finally {
        setIsLoading(false);
      }
    };

    await tryExecute();
  }, [asyncFn, retryAttempts, retryDelay, onSuccess, onError, errorOptions]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    setIsSettled(false);
    retryCountRef.current = 0;
  }, []);

  // Execute immediately if requested
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only want to run on mount
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate]);

  return {
    data,
    error,
    isLoading,
    isSettled,
    execute,
    reset,
  };
}

export default useErrorHandler;