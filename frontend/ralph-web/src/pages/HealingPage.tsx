/**
 * Healing Page
 *
 * Self-healing system dashboard with three-layer recovery visualization.
 */

import * as React from "react";
import { Activity, Layers, Settings, Wrench, Power } from "lucide-react";
import { trpc } from "@/trpc";
import {
  HealingTimeline,
  HealingPolicyEditor,
  KnownFixesList,
  CircuitBreakerStatus,
} from "@/components/healing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";

/**
 * HealingPageProps
 */
interface HealingPageProps {}

/**
 * Loop selector component
 */
function LoopSelector({
  selectedLoop,
  onSelect,
}: {
  selectedLoop: string;
  onSelect: (loopId: string) => void;
}) {
  const { data: loops } = trpc.loops.list.useQuery({});

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Loop:</label>
      <select
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        value={selectedLoop}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">Select a loop...</option>
        {loops?.map((loop) => (
          <option key={loop.id} value={loop.id}>
            {loop.id}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Layer visualization component
 */
function LayerVisualization() {
  const layers = [
    { name: "Agent", description: "Self-correction", color: "bg-blue-500" },
    { name: "Platform", description: "Intervention", color: "bg-purple-500" },
    { name: "Circuit Breaker", description: "Manual", color: "bg-red-500" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Three-Layer Architecture</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          {layers.map((layer, index) => (
            <React.Fragment key={layer.name}>
              <div className="flex flex-col items-center">
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", layer.color)}>
                  <span className="text-white font-bold">{index + 1}</span>
                </div>
                <span className="mt-2 text-sm font-medium">{layer.name}</span>
                <span className="text-xs text-muted-foreground">{layer.description}</span>
              </div>
              {index < layers.length - 1 && (
                <div className="flex-1 h-0.5 bg-border mx-4">
                  <div className="h-full w-1/2 bg-gradient-to-r from-transparent to-muted-foreground/30" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * HealingPage main component
 */
export function HealingPage({}: HealingPageProps) {
  const { t } = useTranslation();
  const [selectedLoop, setSelectedLoop] = React.useState<string>("");

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Self-Healing
          </h1>
          <p className="text-muted-foreground">
            Three-layer fault tolerance and automatic recovery
          </p>
        </div>
        <LoopSelector selectedLoop={selectedLoop} onSelect={setSelectedLoop} />
      </div>

      {/* Layer visualization */}
      <LayerVisualization />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          {/* Circuit breaker status */}
          <CircuitBreakerStatus loopId={selectedLoop} />

          {/* Healing timeline */}
          <HealingTimeline loopId={selectedLoop} limit={10} />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Policy editor */}
          <HealingPolicyEditor />

          {/* Known fixes */}
          <KnownFixesList />
        </div>
      </div>
    </div>
  );
}

export default HealingPage;
