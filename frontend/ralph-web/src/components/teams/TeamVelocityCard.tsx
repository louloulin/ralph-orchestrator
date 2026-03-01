/**
 * Team Velocity Card Component
 *
 * Displays team velocity metrics including:
 * - Tasks per hour
 * - Completion trends
 * - Prediction information
 */

import React from "react";
import { trpc } from "../../trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Activity, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { clsx } from "clsx";

interface TeamVelocityCardProps {
  teamId: string;
  showPrediction?: boolean;
  showHistory?: boolean;
}

export function TeamVelocityCard({ teamId, showPrediction = true, showHistory = false }: TeamVelocityCardProps) {
  // Query velocity metrics
  const { data: velocityData, isLoading: velocityLoading, error: velocityError } =
    trpc.teams.getVelocity.useQuery({ teamId }, {
      enabled: !!teamId,
    });

  // Query predictions
  const { data: predictionData, isLoading: predictionLoading } =
    trpc.teams.predictCompletion.useQuery(
      { teamId },
      { enabled: showPrediction && !!teamId }
    );

  // Query history
  const { data: historyData, isLoading: historyLoading } =
    trpc.teams.getVelocityHistory.useQuery(
      { teamId, durationHours: 24 },
      { enabled: showHistory && !!teamId }
    );

  const isLoading = velocityLoading || (showPrediction && predictionLoading);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Team Velocity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (velocityError || !velocityData?.success) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Activity className="h-5 w-5" />
            Team Velocity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load velocity metrics
          </p>
        </CardContent>
      </Card>
    );
  }

  const velocity = velocityData?.data;
  const prediction = predictionData?.data;
  const history = historyData?.data;

  // Determine trend icon
  const getTrendIcon = (trend: number) => {
    if (trend > 0.1) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend < -0.1) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  // Format trend description
  const getTrendDescription = (trend: number) => {
    if (trend > 0.1) return "Accelerating";
    if (trend < -0.1) return "Decelerating";
    return "Stable";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Team Velocity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Velocity Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Velocity</p>
            <p className="text-2xl font-bold">
              {velocity?.velocity?.toFixed(2) || "0.00"}
              <span className="text-sm font-normal text-muted-foreground">/hr</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Completed</p>
            <p className="text-2xl font-bold">
              {velocity?.total_completed || 0}
            </p>
          </div>
        </div>

        {/* Time Range Stats */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Last Hour</span>
            <span className="font-medium">{velocity?.tasks_last_hour || 0} tasks</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Last 24h</span>
            <span className="font-medium">{velocity?.tasks_last_24h || 0} tasks</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Last 7d</span>
            <span className="font-medium">{velocity?.tasks_last_7d || 0} tasks</span>
          </div>
        </div>

        {/* Prediction */}
        {showPrediction && prediction && (
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Prediction</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Hours Remaining</span>
              <span className="font-medium">
                {prediction.hours_remaining?.toFixed(1) || "N/A"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Trend</span>
              <div className="flex items-center gap-1">
                {getTrendIcon(prediction.trend || 0)}
                <span className="font-medium">
                  {getTrendDescription(prediction.trend || 0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact velocity display for use in lists
 */
export function TeamVelocityBadge({ teamId }: { teamId: string }) {
  const { data, isLoading } = trpc.teams.getVelocity.useQuery(
    { teamId },
    { enabled: !!teamId }
  );

  if (isLoading) {
    return <Skeleton className="h-6 w-20" />;
  }

  const velocity = data?.data?.velocity?.toFixed(1) || "0.0";

  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Activity className="h-3 w-3" />
      {velocity}/hr
    </span>
  );
}
