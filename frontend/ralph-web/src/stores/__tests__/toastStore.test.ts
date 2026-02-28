/**
 * Toast Store Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useToastStore, toast } from "../toastStore";

// Mock timers for testing auto-dismiss
vi.useFakeTimers();

describe("toastStore", () => {
  beforeEach(() => {
    // Clear store state before each test
    useToastStore.setState({ toasts: [] });
  });

  describe("addToast", () => {
    it("should add a toast with generated id and createdAt", () => {
      const { addToast } = useToastStore.getState();

      const id = addToast({
        type: "success",
        title: "Test toast",
      });

      expect(id).toMatch(/^toast-\d+-[a-z0-9]+$/);

      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({
        id,
        type: "success",
        title: "Test toast",
        duration: 5000,
      });
      expect(toasts[0].createdAt).toBeTypeOf("number");
    });

    it("should use custom duration if provided", () => {
      const { addToast } = useToastStore.getState();

      addToast({
        type: "error",
        title: "Error toast",
        duration: 10000,
      });

      const { toasts } = useToastStore.getState();
      expect(toasts[0].duration).toBe(10000);
    });

    it("should store message and action if provided", () => {
      const { addToast } = useToastStore.getState();
      const action = { label: "Retry", onClick: vi.fn() };

      addToast({
        type: "warning",
        title: "Warning",
        message: "Something might be wrong",
        action,
      });

      const { toasts } = useToastStore.getState();
      expect(toasts[0].message).toBe("Something might be wrong");
      expect(toasts[0].action).toBe(action);
    });

    it("should auto-remove toast after duration", () => {
      const { addToast } = useToastStore.getState();

      addToast({
        type: "info",
        title: "Auto dismiss",
        duration: 3000,
      });

      expect(useToastStore.getState().toasts).toHaveLength(1);

      // Fast-forward 3 seconds
      vi.advanceTimersByTime(3000);

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("should not auto-remove toast with duration 0", () => {
      const { addToast } = useToastStore.getState();

      addToast({
        type: "info",
        title: "Persistent toast",
        duration: 0,
      });

      vi.advanceTimersByTime(10000);

      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe("removeToast", () => {
    it("should remove toast by id", () => {
      const { addToast, removeToast } = useToastStore.getState();

      const id1 = addToast({ type: "success", title: "Toast 1" });
      const id2 = addToast({ type: "error", title: "Toast 2" });

      expect(useToastStore.getState().toasts).toHaveLength(2);

      removeToast(id1);

      const { toasts } = useToastStore.getState();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].id).toBe(id2);
    });

    it("should handle removing non-existent toast", () => {
      const { removeToast } = useToastStore.getState();

      // Should not throw
      expect(() => removeToast("non-existent")).not.toThrow();
    });
  });

  describe("clearToasts", () => {
    it("should remove all toasts", () => {
      const { addToast, clearToasts } = useToastStore.getState();

      addToast({ type: "success", title: "Toast 1" });
      addToast({ type: "error", title: "Toast 2" });
      addToast({ type: "warning", title: "Toast 3" });

      expect(useToastStore.getState().toasts).toHaveLength(3);

      clearToasts();

      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe("convenience toast functions", () => {
    it("toast.success should add success toast", () => {
      const id = toast.success("Success!", "Operation completed");

      const { toasts } = useToastStore.getState();
      expect(toasts[0]).toMatchObject({
        id,
        type: "success",
        title: "Success!",
        message: "Operation completed",
      });
    });

    it("toast.error should add error toast", () => {
      const id = toast.error("Error!", "Something failed");

      const { toasts } = useToastStore.getState();
      expect(toasts[0]).toMatchObject({
        id,
        type: "error",
        title: "Error!",
        message: "Something failed",
      });
    });

    it("toast.warning should add warning toast", () => {
      const id = toast.warning("Warning!", "Check this");

      const { toasts } = useToastStore.getState();
      expect(toasts[0]).toMatchObject({
        id,
        type: "warning",
        title: "Warning!",
        message: "Check this",
      });
    });

    it("toast.info should add info toast", () => {
      const id = toast.info("Info", "FYI");

      const { toasts } = useToastStore.getState();
      expect(toasts[0]).toMatchObject({
        id,
        type: "info",
        title: "Info",
        message: "FYI",
      });
    });

    it("should support custom duration in convenience functions", () => {
      toast.success("Test", undefined, 10000);

      const { toasts } = useToastStore.getState();
      expect(toasts[0].duration).toBe(10000);
    });
  });
});
