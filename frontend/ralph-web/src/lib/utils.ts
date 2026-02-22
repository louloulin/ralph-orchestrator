import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format milliseconds to human-readable duration (e.g., "1h 30m")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Format ISO date string to readable format
 */
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString();
}

// ============================================================================
// Accessibility Utilities
// ============================================================================

/**
 * Generate unique IDs for ARIA attributes
 */
let idCounter = 0;
export function generateAriaId(prefix = "ralph"): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Common ARIA props for interactive elements that aren't native buttons
 */
export interface AriaButtonProps {
  role: "button";
  tabIndex: number;
  onKeyDown: (e: React.KeyboardEvent) => void;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-disabled"?: boolean;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
}

/**
 * Get ARIA props for a clickable div/span to make it keyboard accessible
 */
export function getAriaButtonProps(
  onClick: () => void,
  options: {
    label?: string;
    describedBy?: string;
    disabled?: boolean;
    pressed?: boolean;
    expanded?: boolean;
  } = {}
): AriaButtonProps {
  return {
    role: "button",
    tabIndex: options.disabled ? -1 : 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!options.disabled) {
          onClick();
        }
      }
    },
    "aria-label": options.label,
    "aria-describedby": options.describedBy,
    "aria-disabled": options.disabled,
    "aria-pressed": options.pressed,
    "aria-expanded": options.expanded,
  };
}

/**
 * Announce a message to screen readers using a live region
 */
export function announceToScreenReader(
  message: string,
  priority: "polite" | "assertive" = "polite"
): void {
  const announcer = document.getElementById("sr-announcer");
  if (announcer) {
    announcer.setAttribute("aria-live", priority);
    announcer.textContent = message;
    // Clear after announcement
    setTimeout(() => {
      announcer.textContent = "";
    }, 1000);
  }
}

/**
 * Focus management utilities
 */
export const focusUtils = {
  /**
   * Focus the first focusable element within a container
   */
  focusFirst: (container: HTMLElement) => {
    const focusable = container.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  },

  /**
   * Trap focus within a container (for modals, dialogs)
   */
  trapFocus: (container: HTMLElement, event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  },

  /**
   * Return focus to a previously stored element
   */
  returnFocus: (element: HTMLElement | null) => {
    element?.focus();
  },
};
