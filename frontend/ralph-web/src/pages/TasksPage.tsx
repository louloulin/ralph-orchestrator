/**
 * Tasks Page
 *
 * Main dashboard showing active tasks as collapsible threads.
 * Features TaskInput for creating new tasks, TaskSearch for filtering,
 * and ThreadList for viewing existing tasks with real-time polling updates.
 */

import { TaskInput, ThreadList, TaskSearch } from "@/components/tasks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks";

export function TasksPage() {
  const { t } = useTranslation();

  return (
    <>
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("tasks.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("tasks.subtitle")}</p>
      </header>

      {/* Tasks Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tasks.title")}</CardTitle>
          <CardDescription>{t("tasks.activeAndRecent")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TaskInput />

          {/* Task Search with filters */}
          <div className="mb-4">
            <TaskSearch
              showFilters={true}
              showDateFilter={true}
            />
          </div>

          <ThreadList pollingInterval={5000} />
        </CardContent>
      </Card>
    </>
  );
}
