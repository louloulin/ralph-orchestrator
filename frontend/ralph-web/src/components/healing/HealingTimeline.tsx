/**
 * Healing Timeline Component
 *
 * Displays healing events in a chronological timeline format.
 */

import * as React from "react";
import { Clock, CheckCircle2, XCircle, AlertTriangle, Layers } from "lucide-react";
import { trpc } from "@/trpc";
import {
  type HealingEvent,
  HEALING_LAYER_LABELS,
  HEALING_LAYER_COLORS,
  HEALING_TRIGGER_LABELS,
  formatHealingDate,
  getRelativeTime,
} from "@/types/healing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * HealingTimelineProps
 */
interface HealingTimelineProps {
  loopId?: string;
  limit?: number;
  className?: string;
}

/**
 * Single healing event item
 */
function HealingEventItem({ event }: { event: HealingEvent }) {
  const isSuccess = event.result.status === "success";

  return (
    <div className="flex gap-4 relative">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-3 h-3 rounded-full mt-1.5",
            isSuccess ? "bg-green-500" : "bg-red-500"
          )}
        />
        <div className="w-px h-full bg-border flex-1" />
      </div>

      {/* Event content */}
      <Card className="flex-1 mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <Badge className={HEALING_LAYER_COLORS[event.layer]}>
                {HEALING_LAYER_LABELS[event.layer]}
              </Badge>
              <Badge variant="outline">{HEALING_TRIGGER_LABELS[event.trigger]}</Badge>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {getRelativeTime(event.timestamp)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="py-2">
          <div className="text-sm space-y-1">
            <p className="font-medium">{event.action.reason}</p>
            {isSuccess ? (
              <p className="text-muted-foreground">{event.result.details}</p>
            ) : (
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-3 w-3" />
                <span>{event.result.error}</span>
                {event.result.nextLayer && (
                  <Badge variant="outline" className="text-xs">
                    Next: {HEALING_LAYER_LABELS[event.result.nextLayer]}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {event.action.type} • {formatHealingDate(event.timestamp)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Empty state when no events
 */
function EmptyHealingEvents() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Layers className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No Healing Events</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Healing events will appear here when the self-healing system detects and recovers from failures.
      </p>
    </div>
  );
}

/**
 * Loading skeleton
 */
function HealingTimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-muted animate-pulse" />
            <div className="w-px h-32 bg-border" />
          </div>
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <div className="h-5 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-24 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-4 w-48 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

/**
 * HealingTimeline main component
 */
export function HealingTimeline({ loopId, limit = 20, className }: HealingTimelineProps) {
  const { data: events, isLoading, error } = trpc.healing.getEvents.useQuery(
    { loopId: loopId || "", limit },
    { enabled: !!loopId }
  );

  if (!loopId) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Healing Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Select a loop to view healing events
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Healing Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <HealingTimelineSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Healing Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-400">Error loading events: {error.message}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Healing Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {events && events.length > 0 ? (
          <div className="space-y-0">
            {events.map((event) => (
              <HealingEventItem key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyHealingEvents />
        )}
      </CardContent>
    </Card>
  );
}

export default HealingTimeline;
