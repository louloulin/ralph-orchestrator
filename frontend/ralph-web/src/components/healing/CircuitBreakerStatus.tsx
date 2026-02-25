/**
 * Circuit Breaker Status Component
 *
 * Displays circuit breaker state for loops.
 */

import * as React from "react";
import { Power, RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { trpc } from "@/trpc";
import { type CircuitBreakerStatus as CircuitBreakerStatusType, CIRCUIT_BREAKER_STATE_COLORS, CIRCUIT_BREAKER_STATE_LABELS } from "@/types/healing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

/**
 * CircuitBreakerStatusProps
 */
interface CircuitBreakerStatusProps {
  loopId?: string;
  className?: string;
}

/**
 * CircuitBreakerStatus main component
 */
export function CircuitBreakerStatus({ loopId, className }: CircuitBreakerStatusProps) {
  const utils = trpc.useUtils();

  const { data: status, isLoading, refetch } = trpc.healing.getCircuitBreakerStatus.useQuery(
    { loopId: loopId || "" },
    { enabled: !!loopId, refetchInterval: 5000 } // Refresh every 5s
  );

  const resetBreaker = trpc.healing.resetCircuitBreaker.useMutation({
    onSuccess: () => {
      toast.success("Circuit Breaker Reset", "The circuit breaker has been reset.");
      utils.healing.getCircuitBreakerStatus.invalidate();
    },
    onError: (error) => {
      toast.error("Error", error.message);
    },
  });

  if (!loopId) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            Circuit Breaker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a loop to view circuit breaker status
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            Circuit Breaker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-8 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const state = status?.state || "closed";
  const isOpen = state === "open";
  const isHalfOpen = state === "half_open";

  return (
    <Card className={cn(className, isOpen && "border-red-500/50")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            Circuit Breaker
          </CardTitle>
          <Badge className={CIRCUIT_BREAKER_STATE_COLORS[state]}>
            {CIRCUIT_BREAKER_STATE_LABELS[state]}
          </Badge>
        </div>
        <CardDescription>
          Failure protection for loop: {loopId}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status icon */}
        <div className="flex justify-center py-4">
          <div
            className={cn(
              "rounded-full p-6",
              isOpen ? "bg-red-500/20" : isHalfOpen ? "bg-yellow-500/20" : "bg-green-500/20"
            )}
          >
            {isOpen ? (
              <XCircle className="h-12 w-12 text-red-500" />
            ) : isHalfOpen ? (
              <AlertTriangle className="h-12 w-12 text-yellow-500" />
            ) : (
              <CheckCircle className="h-12 w-12 text-green-500" />
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-mono font-bold">{status?.failureCount || 0}</div>
            <div className="text-xs text-muted-foreground">Failure Count</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-mono font-bold">{status?.state || "closed"}</div>
            <div className="text-xs text-muted-foreground">State</div>
          </div>
        </div>

        {/* Timestamps */}
        <div className="space-y-2 text-sm">
          {status?.lastFailureAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <XCircle className="h-3 w-3" />
                Last Failure
              </span>
              <span className="font-mono">
                {new Date(status.lastFailureAt).toLocaleString()}
              </span>
            </div>
          )}
          {status?.nextAttemptAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Clock className="h-3 w-3" />
                Next Attempt
              </span>
              <span className="font-mono">
                {new Date(status.nextAttemptAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => refetch()}
            disabled={false}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant={isOpen ? "default" : "outline"}
            className="flex-1"
            onClick={() => resetBreaker.mutate({ loopId })}
            disabled={resetBreaker.isPending || state === "closed"}
          >
            <Power className="h-4 w-4 mr-2" />
            {resetBreaker.isPending ? "Resetting..." : "Reset"}
          </Button>
        </div>

        {/* State description */}
        <div className="text-xs text-muted-foreground text-center">
          {isOpen && (
            <p>
              Circuit breaker is open. Loop has been stopped to prevent cascading failures.
              Manual intervention is required.
            </p>
          )}
          {isHalfOpen && (
            <p>
              Circuit breaker is half-open. Testing if the loop can recover safely.
            </p>
          )}
          {!isOpen && !isHalfOpen && (
            <p>
              Circuit breaker is closed. Loop is operating normally.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CircuitBreakerStatus;
