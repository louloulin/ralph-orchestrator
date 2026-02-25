/**
 * Healing Policy Editor Component
 *
 * Configuration panel for the self-healing policy.
 */

import * as React from "react";
import { Settings, Save, RefreshCw } from "lucide-react";
import { trpc } from "@/trpc";
import { type HealingPolicy, DEFAULT_HEALING_POLICY } from "@/types/healing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

/**
 * HealingPolicyEditorProps
 */
interface HealingPolicyEditorProps {
  className?: string;
}

/**
 * Layer configuration section
 */
function LayerSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/**
 * HealingPolicyEditor main component
 */
export function HealingPolicyEditor({ className }: HealingPolicyEditorProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: policy, isLoading } = trpc.healing.getPolicy.useQuery({});

  const [formData, setFormData] = React.useState<HealingPolicy>(DEFAULT_HEALING_POLICY);
  const [hasChanges, setHasChanges] = React.useState(false);

  // Update form when policy loads
  React.useEffect(() => {
    if (policy) {
      setFormData(policy);
    }
  }, [policy]);

  const updatePolicy = trpc.healing.updatePolicy.useMutation({
    onSuccess: () => {
      toast.success("Policy updated", "Healing policy has been saved.");
      utils.healing.getPolicy.invalidate();
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error("Error", error.message);
    },
  });

  const handleSave = () => {
    updatePolicy.mutate({ policy: formData });
  };

  const handleReset = () => {
    setFormData(DEFAULT_HEALING_POLICY);
    setHasChanges(true);
  };

  const handleChange = <K extends keyof HealingPolicy>(field: K, value: HealingPolicy[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Healing Policy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Healing Policy
            </CardTitle>
            <CardDescription>
              Configure the three-layer self-healing behavior
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={updatePolicy.isPending}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || updatePolicy.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updatePolicy.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Layer 1: Agent Self-Correction */}
        <LayerSection
          title="Layer 1: Agent Self-Correction"
          description="Automatic retry and backtrack behavior"
        >
          <div className="space-y-2">
            <Label htmlFor="maxAgentRetries">Max Retries</Label>
            <Input
              id="maxAgentRetries"
              type="number"
              min={1}
              max={10}
              value={formData.maxAgentRetries}
              onChange={(e) => handleChange("maxAgentRetries", parseInt(e.target.value, 10))}
            />
            <p className="text-xs text-muted-foreground">
              Number of times the agent can retry before escalating
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agentRetryDelay">Retry Delay</Label>
            <Input
              id="agentRetryDelay"
              value={formData.agentRetryDelay}
              onChange={(e) => handleChange("agentRetryDelay", e.target.value)}
              placeholder="30s"
            />
            <p className="text-xs text-muted-foreground">
              Delay between retries (e.g., 30s, 1m)
            </p>
          </div>
        </LayerSection>

        {/* Layer 2: Platform Intervention */}
        <LayerSection
          title="Layer 2: Platform Intervention"
          description="Automatic restart and backend switching"
        >
          <div className="space-y-2">
            <Label htmlFor="maxPlatformRestarts">Max Restarts</Label>
            <Input
              id="maxPlatformRestarts"
              type="number"
              min={1}
              max={20}
              value={formData.maxPlatformRestarts}
              onChange={(e) => handleChange("maxPlatformRestarts", parseInt(e.target.value, 10))}
            />
            <p className="text-xs text-muted-foreground">
              Number of platform restarts within the window
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="platformRestartWindow">Restart Window</Label>
            <Input
              id="platformRestartWindow"
              value={formData.platformRestartWindow}
              onChange={(e) => handleChange("platformRestartWindow", e.target.value)}
              placeholder="1h"
            />
            <p className="text-xs text-muted-foreground">
              Time window for counting restarts (e.g., 1h, 30m)
            </p>
          </div>
        </LayerSection>

        {/* Layer 3: Circuit Breaker */}
        <LayerSection
          title="Layer 3: Circuit Breaker"
          description="Trip threshold and cooldown behavior"
        >
          <div className="space-y-2">
            <Label htmlFor="circuitBreakerThreshold">Failure Threshold</Label>
            <Input
              id="circuitBreakerThreshold"
              type="number"
              min={1}
              max={100}
              value={formData.circuitBreakerThreshold}
              onChange={(e) => handleChange("circuitBreakerThreshold", parseInt(e.target.value, 10))}
            />
            <p className="text-xs text-muted-foreground">
              Failures before circuit breaker trips
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="circuitBreakerCooldown">Cooldown Period</Label>
            <Input
              id="circuitBreakerCooldown"
              value={formData.circuitBreakerCooldown}
              onChange={(e) => handleChange("circuitBreakerCooldown", e.target.value)}
              placeholder="5m"
            />
            <p className="text-xs text-muted-foreground">
              How long to wait before testing recovery (e.g., 5m, 10m)
            </p>
          </div>
        </LayerSection>

        {/* Fallback Backends */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Fallback Backends</h3>
            <p className="text-sm text-muted-foreground">
              Alternative backends to use when the primary fails
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.backends.map((backend, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-md"
              >
                <span className="text-sm font-mono">{backend}</span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const newBackends = formData.backends.filter((_, i) => i !== index);
                    handleChange("backends", newBackends);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <Input
              className="w-32 h-8"
              placeholder="Add backend"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value.trim();
                  if (value && !formData.backends.includes(value)) {
                    handleChange("backends", [...formData.backends, value]);
                    (e.target as HTMLInputElement).value = "";
                  }
                }
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default HealingPolicyEditor;
