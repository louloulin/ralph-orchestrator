/**
 * Checkpoints Page
 *
 * Page for browsing and managing loop checkpoints.
 * Provides checkpoint listing, detail view, and restore functionality.
 */

import * as React from "react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  RefreshCw,
  Save,
  Trash2,
  RotateCcw,
  Clock,
  HardDrive,
  Loader2,
  ChevronRight,
  FileArchive,
} from "lucide-react";
import { trpc } from "@/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";
import {
  type CheckpointMeta,
  CHECKPOINT_TYPE_LABELS,
  CHECKPOINT_TYPE_COLORS,
} from "@/types/checkpoint";

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format date for display
 */
function formatCheckpointDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Skeleton loader for checkpoints page
 */
function CheckpointsPageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="h-10 w-32 bg-muted animate-pulse rounded" />
      </div>
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Checkpoint card component
 */
function CheckpointCard({
  checkpoint,
  isSelected,
  onSelect,
  onRestore,
  onDelete,
  isRestoring,
}: {
  checkpoint: CheckpointMeta;
  isSelected: boolean;
  onSelect: () => void;
  onRestore: () => void;
  onDelete: () => void;
  isRestoring: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50",
        isSelected && "border-primary ring-1 ring-primary"
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "rounded-full p-2",
                checkpoint.compressed ? "bg-purple-500/20" : "bg-blue-500/20"
              )}
            >
              {checkpoint.compressed ? (
                <FileArchive className="h-4 w-4 text-purple-400" />
              ) : (
                <Save className="h-4 w-4 text-blue-400" />
              )}
            </div>
            <div>
              <div className="font-mono text-sm font-medium">{checkpoint.id}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatCheckpointDate(checkpoint.createdAt)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-2 py-1 text-xs font-medium",
                CHECKPOINT_TYPE_COLORS[checkpoint.checkpointType]
              )}
            >
              {CHECKPOINT_TYPE_LABELS[checkpoint.checkpointType]}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatBytes(checkpoint.size)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              disabled={isRestoring}
              title={t("checkpoints.restore")}
            >
              {isRestoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title={t("checkpoints.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state component
 */
function CheckpointsEmptyState({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <HardDrive className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">{t("checkpoints.empty.title")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("checkpoints.empty.description")}
        </p>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("common.refresh")}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Main Checkpoints Page component
 */
export default function CheckpointsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [selectedCheckpoint, setSelectedCheckpoint] = React.useState<string | null>(null);
  const [loopFilter, setLoopFilter] = React.useState<string>("all");

  // Get loop ID from URL or use default
  const loopId = searchParams.get("loop") || "";

  // Fetch checkpoints list
  const {
    data: checkpoints,
    isLoading,
    refetch,
    isRefetching,
  } = trpc.checkpoint.list.useQuery(
    { loopId },
    {
      enabled: !!loopId,
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Fetch checkpoint stats
  const { data: stats } = trpc.checkpoint.stats.useQuery(
    { cwd: process.cwd?.() },
    {
      refetchInterval: 60000, // Refresh every minute
    }
  );

  // Restore mutation
  const restoreMutation = trpc.checkpoint.restore.useMutation();

  // Handle restore mutation success
  useEffect(() => {
    if (restoreMutation.isSuccess && restoreMutation.data) {
      alert(t("checkpoints.restoreSuccess", { id: restoreMutation.data.checkpoint.id }));
      setSelectedCheckpoint(null);
    }
  }, [restoreMutation.isSuccess, restoreMutation.data, t]);

  // Handle restore mutation error
  useEffect(() => {
    if (restoreMutation.isError && restoreMutation.error) {
      alert(t("checkpoints.restoreError", { error: restoreMutation.error.message }));
    }
  }, [restoreMutation.isError, restoreMutation.error, t]);

  // Delete mutation
  const deleteMutation = trpc.checkpoint.delete.useMutation();

  // Handle delete mutation success
  useEffect(() => {
    if (deleteMutation.isSuccess) {
      refetch();
      setSelectedCheckpoint(null);
    }
  }, [deleteMutation.isSuccess, refetch]);

  // Handle delete mutation error
  useEffect(() => {
    if (deleteMutation.isError && deleteMutation.error) {
      alert(t("checkpoints.deleteError", { error: deleteMutation.error.message }));
    }
  }, [deleteMutation.isError, deleteMutation.error, t]);

  // Get unique loop IDs from checkpoints
  const loopIds = React.useMemo(() => {
    if (!checkpoints) return [];
    const ids = new Set(checkpoints.map((c: { loopId: string }) => c.loopId));
    return Array.from(ids);
  }, [checkpoints]);

  // Filter checkpoints
  const filteredCheckpoints = React.useMemo(() => {
    if (!checkpoints) return [];
    if (loopFilter === "all") return checkpoints;
    // @ts-expect-error - checkpoint type mismatch
    return checkpoints.filter((c) => c.loopId === loopFilter);
  }, [checkpoints, loopFilter]);

  // Loading state
  if (isLoading) {
    return <CheckpointsPageSkeleton />;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("checkpoints.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("checkpoints.description")}</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")} />
          {t("common.refresh")}
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">{t("checkpoints.stats.total")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{formatBytes(stats.totalSize)}</div>
              <div className="text-xs text-muted-foreground">{t("checkpoints.stats.totalSize")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.loopCount}</div>
              <div className="text-xs text-muted-foreground">{t("checkpoints.stats.loops")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {stats.newestAt ? formatCheckpointDate(stats.newestAt) : "-"}
              </div>
              <div className="text-xs text-muted-foreground">{t("checkpoints.stats.latest")}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loop filter */}
      {loopIds.length > 0 && (
        <div className="flex items-center gap-4">
          <select
            value={loopFilter}
            onChange={(e) => setLoopFilter(e.target.value)}
            className="h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">{t("checkpoints.allLoops")}</option>
            {/* @ts-expect-error - loopIds type issue */}
            {loopIds.map((id: string) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Checkpoints list */}
      {!loopId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ChevronRight className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("checkpoints.selectLoop.title")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("checkpoints.selectLoop.description")}
            </p>
          </CardContent>
        </Card>
      ) : filteredCheckpoints.length === 0 ? (
        <CheckpointsEmptyState onRefresh={() => refetch()} />
      ) : (
        <div className="space-y-2">
          {filteredCheckpoints.map((checkpoint: any) => (
            <CheckpointCard
              key={(checkpoint as { id: string }).id}
              checkpoint={checkpoint as any}
              isSelected={selectedCheckpoint === (checkpoint as { id: string }).id}
              onSelect={() => setSelectedCheckpoint((checkpoint as { id: string }).id)}
              onRestore={() => restoreMutation.mutate({ checkpointId: (checkpoint as { id: string }).id })}
              onDelete={() => {
                if (confirm(t("checkpoints.confirmDelete", { id: (checkpoint as { id: string }).id }))) {
                  deleteMutation.mutate({ checkpointId: (checkpoint as { id: string }).id });
                }
              }}
              isRestoring={restoreMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
