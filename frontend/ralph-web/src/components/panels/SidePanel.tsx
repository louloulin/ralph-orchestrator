/**
 * SidePanel Component
 *
 * Slide-out panel system for displaying content as progressive disclosure.
 * Supports click-outside-to-close, keyboard shortcuts, and smooth animations.
 *
 * Panel Types:
 * - tasks: Task list and management
 * - plan: Planning and specifications
 * - monitor: System monitoring, checkpoints, and healing
 * - teams: Team management
 * - projects: Project management
 */

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePanelStore, PanelId } from "@/stores/panelStore";

/** SidePanel props */
export interface SidePanelProps {
  /** Panel content */
  children: React.ReactNode;
  /** Optional className for content area */
  className?: string;
  /** Panel width in pixels (default: 600) */
  width?: number;
  /** Show backdrop overlay (default: true) */
  showBackdrop?: boolean;
  /** Close on backdrop click (default: true) */
  closeOnBackdropClick?: boolean;
}

/**
 * SidePanel - Slide-out panel container with animations.
 *
 * Wraps panel content with slide-in animation from right,
 * backdrop overlay, and click-outside-to-close behavior.
 */
export function SidePanel({
  children,
  className,
  width = 600,
  showBackdrop = true,
  closeOnBackdropClick = true,
}: SidePanelProps) {
  const { activePanel, closePanel } = usePanelStore();
  const isOpen = activePanel !== null;
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap inside panel when open
  useEffect(() => {
    if (isOpen && panelRef.current) {
      // Focus first focusable element
      const focusable = panelRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      focusable?.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closePanel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, closePanel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          {showBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={closeOnBackdropClick ? closePanel : undefined}
              aria-hidden="true"
            />
          )}

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed right-0 top-0 h-full z-50 bg-card border-l border-border shadow-xl",
              "flex flex-col"
            )}
            style={{ width: `${width}px`, maxWidth: "100vw" }}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-lg font-semibold">
                {getPanelTitle(activePanel)}
              </h2>
              <button
                onClick={closePanel}
                aria-label="Close panel"
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-md",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "transition-colors"
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel Content */}
            <div className={cn("flex-1 overflow-auto", "p-4", className)}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Get panel title for aria-label and header.
 */
function getPanelTitle(panelId: PanelId): string {
  const titles: Record<Exclude<PanelId, null>, string> = {
    tasks: "Tasks",
    plan: "Planning",
    monitor: "Monitoring",
    teams: "Teams",
    projects: "Projects",
  };
  return panelId ? titles[panelId] : "Panel";
}

/**
 * SidePanelContent - Wrapper for panel-specific content.
 * Conditionally renders content only when its panel is active.
 */
export function SidePanelContent({ panelId, children }: { panelId: Exclude<PanelId, null>; children: React.ReactNode }) {
  const { activePanel } = usePanelStore();
  return activePanel === panelId ? <>{children}</> : null;
}
