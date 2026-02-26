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
  const updateMutation = trpc.config.update.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      setSaveStatus("success");
      configQuery.refetch();
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: () => {
      setSaveStatus("error");
    },
  });

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
  const envVars = [
    { name: "RALPH_TELEGRAM_BOT_TOKEN", description: "Telegram bot token for human-in-the-loop", requiredFor: "RObot (Telegram)" },
    { name: "RALPH_DIAGNOSTICS", description: "Enable diagnostics output (set to 1)", requiredFor: "Debugging" },
    { name: "RALPH_VERBOSE", description: "Enable verbose output (set to 1)", requiredFor: "Debugging" },
    { name: "RALPH_QUIET", description: "Suppress non-essential output (set to 1)", requiredFor: "Quiet mode" },
    { name: "RALPH_WORKSPACE_ROOT", description: "Override workspace root path", requiredFor: "Web server" },
    { name: "RALPH_BACKEND_PORT", description: "Override backend server port", requiredFor: "Web server" },
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
            Ralph configuration via environment variables. Set these in your shell profile
            (.bashrc, .zshrc) or system environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {envVars.map((envVar) => (
              <div
                key={envVar.name}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-primary">{envVar.name}</code>
                    {envVar.requiredFor && (
                      <Badge variant="outline" className="text-xs">
                        {envVar.requiredFor}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{envVar.description}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 flex-shrink-0"
                  onClick={() => handleCopyEnvVar(envVar.name)}
                  title="Copy variable name"
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
          <p className="text-xs text-muted-foreground mt-4">
            Note: Environment variables must be set before starting Ralph. Changes require a restart.
          </p>
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
