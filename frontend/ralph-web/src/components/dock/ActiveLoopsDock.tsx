/**
 * ActiveLoopsDock Component
 *
 * Persistent dock at the bottom of the screen showing active Ralph loops.
 * Provides multi-task visibility with real-time status updates.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { LoopCard } from "./LoopCard";
import { useLoopStore, useLoopsQuery, type Loop } from "@/stores/loopStore";

/**
 * ActiveLoopsDock - Bottom dock showing active loops
 *
 * Displays all active loops as cards with status indicators,
 * progress tracking, and control buttons.
 */
export function ActiveLoopsDock() {
  const { t } = useTranslation();
  const { setLoops, setLoading, setError, loops, isLoading, error } = useLoopStore();

  // Fetch loops via tRPC with polling
  useLoopsQuery();

  // Don't show dock if no loops and not loading
  if (loops.length === 0 && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border"
    >
      <div className="max-w-full mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Header with count */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-foreground">
              {loops.length} {t("dock.activeLoops")}
            </span>
          </div>

          {/* Loop cards scrollable container */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-3 min-w-0">
              <AnimatePresence mode="popLayout">
                {loops.map((loop) => (
                  <LoopCard key={loop.id} loop={loop} />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              aria-label={t("dock.newTask")}
            >
              {t("dock.newTask")}
            </button>
            {loops.length > 0 && (
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                aria-label={t("dock.pauseAll")}
              >
                {t("dock.pauseAll")}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
