/**
 * KanbanPage Component
 *
 * A Kanban board view for managing tasks with drag-and-drop.
 * Displays tasks organized by status: To Do, In Progress, In Review, Done.
 *
 * Inspired by Vibe Kanban design patterns.
 *
 * @see https://github.com/BloopAI/vibe-kanban
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KanbanBoard } from "@/components/kanban";

export function KanbanPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Kanban Board</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Drag and drop tasks between columns to update their status
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Task Board</CardTitle>
          <CardDescription>
            Tasks organized by workflow stage. Drag cards to move between columns.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-4 px-4">
          <KanbanBoard />
        </CardContent>
      </Card>
    </>
  );
}
