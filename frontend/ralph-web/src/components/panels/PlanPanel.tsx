/**
 * PlanPanel Component
 *
 * Side panel adaptation of the PlanPage for the chat-centric interface.
 * Provides planning workflow within a slide-out panel.
 *
 * Features:
 * - Compact planning workflow UI
 * - Spec list and management
 * - Optimized for side panel width constraints
 */

import { useState } from "react";
import { Plus, FileText, Search, Filter, CheckCircle2, Clock } from "lucide-react";
import { useTranslation } from "@/hooks";
import { usePanelStore } from "@/stores/panelStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";

/**
 * PlanPanel - Planning workflow within side panel
 */
export function PlanPanel() {
  const { t } = useTranslation();
  const { closePanel } = usePanelStore();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Fetch specs for list
  const { data: specsData, isLoading } = trpc.spec.list.useQuery();
  const specs = specsData?.specs ?? [];

  // Filter specs based on search
  const filteredSpecs = specs.filter((spec) =>
    spec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    spec.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Count specs by status
  const draftCount = specs.filter((s) => s.status === "draft").length;
  const approvedCount = specs.filter((s) => s.status === "approved").length;
  const inProgressCount = specs.filter((s) => s.status === "in-progress").length;

  const handleCreateSpec = () => {
    // TODO: Open spec creation modal
    console.log("Create spec");
  };

  if (activeSessionId) {
    // In-panel session view
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">{t("plan.sessionTitle")}</h3>
          <Button size="sm" variant="outline" onClick={() => setActiveSessionId(null)}>
            ← {t("common.back")}
          </Button>
        </div>

        <Card className="flex-1 overflow-auto">
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("plan.sessionViewPlaceholder") || "Active plan session view"}</p>
              <p className="text-sm mt-2">{t("plan.fullSessionOnPage") || "Full session available on Plan page"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header with Stats */}
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{t("plan.title")}</h3>
            <Badge variant="secondary" className="text-xs">
              {specs.length}
            </Badge>
          </div>
          <Button size="sm" onClick={handleCreateSpec}>
            <Plus className="h-4 w-4 mr-1" />
            {t("plan.create")}
          </Button>
        </div>

        {/* Status Summary */}
        <div className="flex gap-2 flex-wrap">
          {draftCount > 0 && (
            <Badge variant="secondary" className="bg-gray-500/10 text-gray-500">
              {draftCount} {t("plan.status.draft")}
            </Badge>
          )}
          {inProgressCount > 0 && (
            <Badge className="bg-blue-500/10 text-blue-500">
              <Clock className="h-3 w-3 mr-1" />
              {inProgressCount} {t("plan.status.inProgress")}
            </Badge>
          )}
          {approvedCount > 0 && (
            <Badge className="bg-green-500/10 text-green-500">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {approvedCount} {t("plan.status.approved")}
            </Badge>
          )}
        </div>
      </div>

      <div className="border-b mb-4" />

      {/* Search and Filters */}
      <div className="space-y-3 pb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("plan.searchPlaceholder") || "Search specs..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            size="icon"
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="text-sm font-medium">{t("plan.filterByStatus")}</div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline">{t("plan.status.draft")}</Button>
              <Button size="sm" variant="outline">{t("plan.status.inProgress")}</Button>
              <Button size="sm" variant="outline">{t("plan.status.approved")}</Button>
            </div>
          </div>
        )}
      </div>

      {/* Spec List */}
      <div className="flex-1 -mx-4 px-4 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSpecs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{searchQuery ? t("plan.noResults") : t("plan.noSpecs")}</p>
              <Button size="sm" className="mt-4" onClick={handleCreateSpec}>
                <Plus className="h-4 w-4 mr-1" />
                {t("plan.createFirst")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSpecs.map((spec) => (
              <Card
                key={spec.id}
                className={cn(
                  "cursor-pointer hover:bg-accent/50 transition-colors",
                  "border-l-2",
                  spec.status === "approved" && "border-l-green-500",
                  spec.status === "in-progress" && "border-l-blue-500",
                  spec.status === "draft" && "border-l-gray-500"
                )}
                onClick={() => setActiveSessionId(spec.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{spec.title}</h4>
                      {spec.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {spec.description}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0",
                        spec.status === "approved" && "bg-green-500/10 text-green-500",
                        spec.status === "in-progress" && "bg-blue-500/10 text-blue-500",
                        spec.status === "draft" && "bg-gray-500/10 text-gray-500"
                      )}
                    >
                      {t(`plan.status.${spec.status}`)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Panel Footer */}
      <div className="pt-4 border-t mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isLoading
              ? t("common.loading")
              : t("plan.showingCount", { count: filteredSpecs.length })
            }
          </span>
          <Button variant="ghost" size="sm" onClick={closePanel}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
