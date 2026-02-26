/**
 * LoopCard Component
 *
 * Individual card display for a single Ralph loop in the dock.
 * Shows status, prompt snippet, progress, and control buttons.
 */

import { motion } from "framer-motion";
import { Pause, Play, Square, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { trpc } from "@/trpc";
import { useLoopStore } from "@/stores/loopStore";
import { toast } from "@/stores/toastStore";

interface LoopCardProps {
  loop: {
    id: string;
    status: "running" | "completed" | "failed" | "merging" | "stuck" | "queued";
    location: string;
    pid?: number;
    prompt?: string;
  };
}

/**
 * Get status icon for loop state
 */
function getStatusIcon(status: LoopCardProps["loop"]["status"]) {
  switch (status) {
    case "running":
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "failed":
    case "stuck":
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case "merging":
      return <Loader2 className="w-4 h-4 animate-spin text-purple-500" />;
    case "queued":
      return <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-transparent" />;
    default:
      return <div className="w-4 h-4 rounded-full bg-muted-foreground" />;
  }
}

/**
 * Get status color class
 */
function getStatusColor(status: LoopCardProps["loop"]["status"]): string {
  switch (status) {
    case "running":
      return "border-blue-500/30 bg-blue-500/5";
    case "completed":
      return "border-green-500/30 bg-green-500/5";
    case "failed":
    case "stuck":
      return "border-red-500/30 bg-red-500/5";
    case "merging":
      return "border-purple-500/30 bg-purple-500/5";
    case "queued":
      return "border-yellow-500/30 bg-yellow-500/5";
    default:
      return "border-border bg-muted/30";
  }
}

/**
 * Truncate prompt to fit in card
 */
function truncatePrompt(prompt?: string): string {
  if (!prompt) return "";
  const maxLength = 60;
  if (prompt.length <= maxLength) return prompt;
  return prompt.slice(0, maxLength) + "...";
}

/**
 * LoopCard - Display single loop with status and controls
 */
export function LoopCard({ loop }: LoopCardProps) {
  const { t } = useTranslation();
  const { refresh } = useLoopStore();
  const utils = trpc.useContext();
  const { mutate: stopLoop } = trpc.loops.stop.useMutation();
  const { mutate: mergeLoop } = trpc.loops.merge.useMutation();

  const handleStop = () => {
    stopLoop(
      { id: loop.id, force: false },
      {
        onSuccess: () => {
          utils.loops.list.invalidate();
          refresh();
          toast.add({
            type: "success",
            title: t("dock.loopStopped"),
            message: t("dock.loopStoppedMessage"),
          });
        },
        onError: (error) => {
          toast.add({
            type: "error",
            title: t("dock.stopFailed"),
            message: error.message,
          });
        },
      }
    );
  };

  const handleMerge = () => {
    mergeLoop(
      { id: loop.id, force: false },
      {
        onSuccess: () => {
          utils.loops.list.invalidate();
          refresh();
          toast.add({
            type: "success",
            title: t("dock.mergeTriggered"),
            message: t("dock.mergeTriggeredMessage"),
          });
        },
        onError: (error) => {
          toast.add({
            type: "error",
            title: t("dock.mergeFailed"),
            message: error.message,
          });
        },
      }
    );
  };

  const statusColor = getStatusColor(loop.status);
  const isRunning = loop.status === "running";
  const isCompleted = loop.status === "completed";
  const isStuck = loop.status === "stuck" || loop.status === "failed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={`
        shrink-0 w-72 rounded-lg border-2 p-3
        flex flex-col gap-2
        ${statusColor}
        hover:shadow-md transition-shadow
      `}
    >
      {/* Header with status icon and prompt */}
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5">{getStatusIcon(loop.status)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {truncatePrompt(loop.prompt)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {loop.id.slice(0, 8)} • {loop.location}
          </p>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-semibold text-muted-foreground">
          {t(`dock.status.${loop.status}`)}
        </span>
        {loop.pid && (
          <span className="text-[10px] text-muted-foreground">
            PID: {loop.pid}
          </span>
        )}
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-1">
        {isRunning && (
          <button
            onClick={handleStop}
            className="flex-1 px-2 py-1 text-xs font-medium rounded bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1"
            aria-label={t("dock.stopLoop")}
          >
            <Square className="w-3 h-3" />
            {t("dock.stop")}
          </button>
        )}
        {isCompleted && (
          <button
            onClick={handleMerge}
            className="flex-1 px-2 py-1 text-xs font-medium rounded bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors flex items-center justify-center gap-1"
            aria-label={t("dock.mergeLoop")}
          >
            <Play className="w-3 h-3" />
            {t("dock.merge")}
          </button>
        )}
        {isStuck && (
          <button
            onClick={handleMerge}
            className="flex-1 px-2 py-1 text-xs font-medium rounded bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors flex items-center justify-center gap-1"
            aria-label={t("dock.retryMerge")}
          >
            <Play className="w-3 h-3" />
            {t("dock.retry")}
          </button>
        )}
      </div>
    </motion.div>
  );
}
