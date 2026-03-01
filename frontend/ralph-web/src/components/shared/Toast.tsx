/**
 * Toast Component
 *
 * Displays toast notifications with different types (success, error, warning, info).
 * Includes auto-dismiss, manual close, and optional action buttons.
 */

import { useEffect, type ReactNode } from "react";
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type ToastType } from "@/stores/toastStore";

/**
 * Icon mapping for toast types
 */
const TOAST_ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

/**
 * Color mapping for toast types
 */
const TOAST_COLORS: Record<
  ToastType,
  {
    icon: string;
    border: string;
    bg: string;
  }
> = {
  success: {
    icon: "text-green-500",
    border: "border-green-500/20",
    bg: "bg-green-500/10",
  },
  error: {
    icon: "text-red-500",
    border: "border-red-500/20",
    bg: "bg-red-500/10",
  },
  warning: {
    icon: "text-yellow-500",
    border: "border-yellow-500/20",
    bg: "bg-yellow-500/10",
  },
  info: {
    icon: "text-blue-500",
    border: "border-blue-500/20",
    bg: "bg-blue-500/10",
  },
};

/**
 * Toast component
 */
export function Toast({
  toast,
  onClose,
}: {
  toast: {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  };
  onClose: (id: string) => void;
}): ReactNode {
  const { type, title, message, action, id } = toast;
  const Icon = TOAST_ICONS[type];
  const colors = TOAST_COLORS[type];

  // Auto-dismiss after duration
  useEffect(() => {
    const duration = toast.duration ?? 5000;
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, toast.duration, onClose]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border shadow-lg",
        "animate-in slide-in-from-right-5",
        "transition-all duration-300",
        "bg-background",
        colors.border,
        colors.bg
      )}
      role="alert"
      aria-live="polite"
    >
      {/* Icon */}
      <div className={cn("flex-shrink-0 mt-0.5", colors.icon)}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        {message && (
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        )}
        {action && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              onClose(id);
            }}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={() => onClose(id)}
        className={cn(
          "flex-shrink-0 p-1 rounded-md",
          "text-muted-foreground hover:text-foreground",
          "hover:bg-muted transition-colors"
        )}
        aria-label="Close notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Toast container component
 */
export function ToastContainer(): ReactNode {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </div>
  );
}

export default ToastContainer;