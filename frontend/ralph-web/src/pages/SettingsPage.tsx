/**
 * SettingsPage
 *
 * Settings page for editing ralph.yml configuration.
 * Features:
 * - YAML editor showing the config
 * - Save button to persist changes
 * - Hat collection dropdown (only affects hat collection, not backend args)
 */

import { useState, useEffect } from "react";
import { trpc } from "../trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, AlertCircle, CheckCircle2, RefreshCw, Trash2, Globe, Terminal, Copy, Check } from "lucide-react";
import { clearAllRalphLocalStorage, getRalphLocalStorageInfo, useTranslation } from "@/hooks";
import { LocaleSwitcher } from "@/components/shared";

export function SettingsPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [cacheCleared, setCacheCleared] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<{ key: string; size: number }[]>([]);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);

  const configQuery = trpc.config.get.useQuery();
  const presetsQuery = trpc.presets.list.useQuery();
  const updateMutation = trpc.config.update.useMutation();

  // Handle mutation success with useEffect
  useEffect(() => {
    if (updateMutation.isSuccess) {
      setIsDirty(false);
      setSaveStatus("success");
      configQuery.refetch();
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [updateMutation.isSuccess, configQuery]);

  // Handle mutation error with useEffect
  useEffect(() => {
    if (updateMutation.isError) {
      setSaveStatus("error");
    }
  }, [updateMutation.isError]);

  // Load cache info on mount
  useEffect(() => {
    setCacheInfo(getRalphLocalStorageInfo());
  }, []);

  // Initialize content from query
  useEffect(() => {
    if (configQuery.data?.raw && !isDirty) {
      setContent(configQuery.data.raw);
    }
  }, [configQuery.data?.raw, isDirty]);

  const handleContentChange = (value: string) => {
    setContent(value);
    setIsDirty(true);
    setSaveStatus("idle");
  };

  const handleSave = () => {
    updateMutation.mutate({ content });
  };

  const handleReset = () => {
    if (configQuery.data?.raw) {
      setContent(configQuery.data.raw);
      setIsDirty(false);
      setSaveStatus("idle");
    }
  };

  const handleClearCache = () => {
    clearAllRalphLocalStorage();
    setCacheInfo([]);
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 3000);
  };

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const totalCacheSize = cacheInfo.reduce((sum, item) => sum + item.size, 0);

  // Extract current hat collection from config
  const currentHatCollection = configQuery.data?.parsed?.hats
    ? "default"
    : undefined;

  // Get available presets for the dropdown
  const presets = presetsQuery.data ?? [];

  // Environment variables that Ralph supports
  // Grouped by category for better organization (P2-5: Enhanced Environment Variables)
  const envVarCategories = [
    {
      name: "Web Server",
      description: "Configuration for the web dashboard and API server",
      vars: [
        {
          name: "RALPH_BACKEND_PORT",
          description: "Port for the backend API server (default: 3000)",
          example: "3000",
          requiredFor: "Web server",
        },
        {
          name: "RALPH_WORKSPACE_ROOT",
          description: "Override the default workspace root directory",
          example: "/path/to/workspace",
          requiredFor: "Web server",
        },
        {
          name: "RALPH_DB_PATH",
          description: "Custom path for the SQLite database file",
          example: "/custom/path/ralph.db",
          requiredFor: "Database",
        },
      ],
    },
    {
      name: "RObot (Telegram Integration)",
      description: "Human-in-the-loop interaction via Telegram bot",
      vars: [
        {
          name: "RALPH_TELEGRAM_BOT_TOKEN",
          description: "Telegram bot token for human-in-the-loop communication",
          example: "123456:ABC-DEF1234...",
          requiredFor: "RObot",
          sensitive: true,
        },
        {
          name: "RALPH_ROBOT_TIMEOUT",
          description: "Timeout in seconds for waiting for human response (default: 300)",
          example: "300",
          requiredFor: "RObot",
        },
      ],
    },
    {
      name: "Diagnostics & Logging",
      description: "Control output verbosity and debugging information",
      vars: [
        {
          name: "RALPH_DIAGNOSTICS",
          description: "Enable detailed diagnostics output to .ralph/diagnostics/",
          example: "1",
          requiredFor: "Debugging",
        },
        {
          name: "RALPH_VERBOSE",
          description: "Enable verbose output with additional logging",
          example: "1",
          requiredFor: "Debugging",
        },
        {
          name: "RALPH_QUIET",
          description: "Suppress non-essential output for cleaner logs",
          example: "1",
          requiredFor: "Quiet mode",
        },
      ],
    },
    {
      name: "Advanced",
      description: "Advanced configuration options",
      vars: [
        {
          name: "RALPH_DATA_DIR",
          description: "Override the default Ralph data directory (~/.ralph)",
          example: "/custom/ralph/data",
          requiredFor: "Data storage",
        },
        {
          name: "RALPH_DISABLE_TELEMETRY",
          description: "Disable anonymous usage telemetry",
          example: "1",
          requiredFor: "Privacy",
        },
      ],
    },
  ];

  const handleCopyEnvVar = (varName: string) => {
    navigator.clipboard.writeText(varName);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  return (
    <>
      {/* Page header */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure your Ralph orchestrator
          </p>
        </div>
        <Badge variant="secondary">ralph.yml</Badge>
      </header>

      {/* Hat Collection Selector */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Hat Collection</CardTitle>
          <CardDescription>
            Select a preset hat collection. This only affects the hat workflow,
            not backend settings like CLI arguments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label htmlFor="hat-collection" className="min-w-[120px]">
              Active Collection
            </Label>
            <select
              id="hat-collection"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={currentHatCollection ?? ""}
              disabled={presetsQuery.isLoading}
            >
              {currentHatCollection && (
                <option value="default">Default (from config)</option>
              )}
              {presets.map((preset: any) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.source})
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The dropdown selection is read-only. Edit the YAML below to change the hat collection.
          </p>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("settings.appearance")}
          </CardTitle>
          <CardDescription>
            {t("settings.languageDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("settings.language")}</Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t("settings.languageDescription")}
              </p>
            </div>
            <LocaleSwitcher />
          </div>
        </CardContent>
      </Card>

      {/* Environment Variables */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Environment Variables
          </CardTitle>
          <CardDescription>
            Configure Ralph through environment variables. Set these in your shell profile
            (.bashrc, .zshrc), system environment, or a .env file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {envVarCategories.map((category) => (
              <div key={category.name} className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    {category.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {category.description}
                  </p>
                </div>
                <div className="space-y-2 ml-4">
                  {category.vars.map((envVar) => (
                    <div
                      key={envVar.name}
                      className="group flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-sm font-mono text-primary">
                            {envVar.name}
                          </code>
                          <Badge
                            variant={envVar.sensitive ? "destructive" : "outline"}
                            className="text-xs"
                          >
                            {envVar.requiredFor}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {envVar.description}
                        </p>
                        {envVar.example && (
                          <p className="text-xs text-muted-foreground mt-1 font-mono bg-muted px-2 py-1 rounded">
                            Example: {envVar.example}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 flex-shrink-0"
                        onClick={() => handleCopyEnvVar(envVar.name)}
                        title={`Copy ${envVar.name}`}
                      >
                        {copiedVar === envVar.name ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-900 dark:text-blue-100">
                <p className="font-semibold mb-1">How to set environment variables:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>Temporary:</strong> Run <code>export KEY=value</code> in your terminal</li>
                  <li><strong>Permanent:</strong> Add to ~/.bashrc, ~/.zshrc, or shell profile</li>
                  <li><strong>.env file:</strong> Create a .env file in the project root</li>
                  <li><strong>System:</strong> Set via system settings (requires restart)</li>
                </ul>
                <p className="mt-2 text-muted-foreground">
                  Note: Changes to environment variables require restarting the Ralph server.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Configuration
                {isDirty && (
                  <Badge variant="outline" className="ml-2 text-yellow-600 border-yellow-600">
                    Unsaved changes
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Edit your ralph.yml configuration directly
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === "success" && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Error saving
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!isDirty || updateMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {configQuery.isLoading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Loading configuration...
            </div>
          ) : configQuery.isError ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-destructive">
                {configQuery.error.message}
              </p>
              <Button variant="outline" onClick={() => configQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="font-mono text-sm min-h-[500px] resize-y"
                placeholder="# Ralph configuration"
                spellCheck={false}
              />
              {updateMutation.isError && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{updateMutation.error.message}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear Cache */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Clear Local Cache
          </CardTitle>
          <CardDescription>
            Clear all locally stored preferences and UI state. This will reset
            your sidebar state, preset selection, and command history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {cacheInfo.length > 0 && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">Stored data ({formatBytes(totalCacheSize)}):</p>
                <ul className="list-disc list-inside pl-2">
                  {cacheInfo.map((item) => (
                    <li key={item.key}>
                      {item.key} ({formatBytes(item.size)})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-4">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearCache}
                disabled={cacheCleared}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {cacheCleared ? "Cache Cleared" : "Clear Cache"}
              </Button>
              {cacheCleared && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  All cached data cleared. Refresh the page to see changes.
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
