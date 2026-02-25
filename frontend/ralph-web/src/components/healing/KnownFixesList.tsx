/**
 * Known Fixes List Component
 *
 * Displays and manages known fix patterns for automatic error recovery.
 */

import * as React from "react";
import { Wrench, Plus, Trash2, CheckCircle, XCircle, TestTube } from "lucide-react";
import { trpc } from "@/trpc";
import { type KnownFix, type FixAction } from "@/types/healing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/stores/toastStore";
import { cn } from "@/lib/utils";

/**
 * KnownFixesListProps
 */
interface KnownFixesListProps {
  className?: string;
}

/**
 * Single fix item component
 */
function KnownFixItem({
  fix,
  onDelete,
  onTest,
}: {
  fix: KnownFix;
  onDelete: () => void;
  onTest: (error: string) => void;
}) {
  const [showTest, setShowTest] = React.useState(false);
  const [testError, setTestError] = React.useState("");

  const getActionLabel = (action: FixAction): string => {
    if ("restart" in action) return "Restart";
    if ("switch_backend" in action) return `Switch to ${action.backend}`;
    if ("inject_context" in action) return "Inject Context";
    if ("skip_step" in action) return "Skip Step";
    if ("request_human" in action) return "Request Human";
    return "Unknown";
  };

  return (
    <Card className="mb-3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium font-mono text-sm">{fix.id}</span>
            <Badge variant="outline">{getActionLabel(fix.action)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTest(!showTest)}
            >
              <TestTube className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-red-400" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-2">
        <p className="text-sm text-muted-foreground mb-2">{fix.description}</p>
        <div className="text-xs font-mono bg-muted p-2 rounded mb-2 overflow-x-auto">
          /{fix.pattern}/i
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Success rate: {(fix.successRate * 100).toFixed(0)}%
          </span>
        </div>

        {/* Test panel */}
        {showTest && (
          <div className="mt-3 pt-3 border-t">
            <Label className="text-xs">Test error message:</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={testError}
                onChange={(e) => setTestError(e.target.value)}
                placeholder="Enter error message to test..."
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={() => onTest(testError)}>
                Test
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Add new fix form
 */
function AddKnownFixForm({ onAdd }: { onAdd: () => void }) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [id, setId] = React.useState("");
  const [pattern, setPattern] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [actionType, setActionType] = React.useState<string>("inject_context");
  const [actionContent, setActionContent] = React.useState("");
  const [successRate, setSuccessRate] = React.useState(0.9);

  const addFix = trpc.healing.addKnownFix.useMutation({
    onSuccess: () => {
      toast.success("Fix added", "New known fix pattern has been added.");
      utils.healing.getKnownFixes.invalidate();
      // Reset form
      setId("");
      setPattern("");
      setDescription("");
      setActionContent("");
      onAdd();
    },
    onError: (error) => {
      toast.error("Error", error.message);
    },
  });

  const handleSubmit = () => {
    if (!id || !pattern || !description || !actionContent) {
      toast.error("Error", "Please fill in all fields");
      return;
    }

    let action: FixAction;
    switch (actionType) {
      case "restart":
        action = { type: "restart" };
        break;
      case "switch_backend":
        action = { type: "switch_backend", backend: actionContent };
        break;
      case "inject_context":
        action = { type: "inject_context", content: actionContent };
        break;
      case "skip_step":
        action = { type: "skip_step" };
        break;
      case "request_human":
        action = { type: "request_human" };
        break;
      default:
        action = { type: "inject_context", content: actionContent };
    }

    addFix.mutate({
      id,
      pattern,
      description,
      action,
      successRate,
    });
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Known Fix Pattern
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>ID</Label>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g., rate_limit_exceeded"
              />
            </div>
            <div className="space-y-1">
              <Label>Success Rate</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={successRate}
                onChange={(e) => setSuccessRate(parseFloat(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Pattern (RegEx)</Label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g., rate limit|429|too many requests"
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Handle API rate limits"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Action Type</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1"
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
              >
                <option value="inject_context">Inject Context</option>
                <option value="restart">Restart</option>
                <option value="switch_backend">Switch Backend</option>
                <option value="skip_step">Skip Step</option>
                <option value="request_human">Request Human</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Action Value</Label>
              <Input
                value={actionContent}
                onChange={(e) => setActionContent(e.target.value)}
                placeholder="Context or backend name"
              />
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={addFix.isPending}>
            <Plus className="h-4 w-4 mr-2" />
            {addFix.isPending ? "Adding..." : "Add Fix"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * KnownFixesList main component
 */
export function KnownFixesList({ className }: KnownFixesListProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [showAddForm, setShowAddForm] = React.useState(false);

  const { data: fixes, isLoading } = trpc.healing.getKnownFixes.useQuery({});

  const testFix = trpc.healing.testFix.useMutation({
    onSuccess: (result) => {
      if (result.matches) {
        toast.success("Match Found", `This error matches fix: ${result.fix?.id}`);
      } else {
        toast.info("No Match", "This error does not match any known fix");
      }
    },
  });

  const handleTest = (fixId: string, error: string) => {
    testFix.mutate({ fixId, error });
  };

  // Note: Delete would need a separate mutation - for now just show the list

  if (isLoading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Known Fixes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded" />
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
              <Wrench className="h-5 w-5" />
              Known Fixes
            </CardTitle>
            <CardDescription>
              Error patterns and automatic recovery actions
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAddForm && <AddKnownFixForm onAdd={() => setShowAddForm(false)} />}

        {fixes && fixes.length > 0 ? (
          <div className="space-y-2">
            {fixes.map((fix) => (
              <KnownFixItem
                key={fix.id}
                fix={fix}
                onDelete={() => {
                  // Would implement delete mutation here
                  toast.info("Delete not implemented", "Use backend to delete fixes");
                }}
                onTest={(error) => handleTest(fix.id, error)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No known fixes configured</p>
            <p className="text-sm">Add fix patterns to enable automatic error recovery</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default KnownFixesList;
