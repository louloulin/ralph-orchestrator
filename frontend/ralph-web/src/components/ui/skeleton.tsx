/**
 * Skeleton Component
 *
 * A loading placeholder component with animated pulse effect.
 * Used to show loading states while content is being fetched.
 */

import React from "react";
import { clsx } from "clsx";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Additional class names */
  className?: string;
}

/**
 * Animated skeleton loader for loading states
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      {...props}
    />
  );
}
