/**
 * Panel Content Wrappers
 *
 * Wrappers that render existing page components as panel content.
 * Each component extracts the core content from a page and adap it for panel display.
 */

import { TasksPage } from "@/pages/TasksPage";
import { PlanPage } from "@/pages/PlanPage";
import { MonitoringPage } from "@/pages/MonitoringPage";
import { TeamsPage } from "@/pages/TeamsPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { SidePanelContent } from "@/components/panels";

/**
 * TasksPanelContent - Tasks page adapted for panel display.
 */
export function TasksPanelContent() {
  return (
    <SidePanelContent panelId="tasks">
      <TasksPage />
    </SidePanelContent>
  );
}

/**
 * PlanPanelContent - Planning page adapted for panel display.
 */
export function PlanPanelContent() {
  return (
    <SidePanelContent panelId="plan">
      <PlanPage />
    </SidePanelContent>
  );
}

/**
 * MonitorPanelContent - Monitoring page adapted for panel display.
 * Combines monitoring, checkpoints, and healing views.
 */
export function MonitorPanelContent() {
  return (
    <SidePanelContent panelId="monitor">
      <MonitoringPage />
    </SidePanelContent>
  );
}

/**
 * TeamsPanelContent - Teams page adapted for panel display.
 */
export function TeamsPanelContent() {
  return (
    <SidePanelContent panelId="teams">
      <TeamsPage />
    </SidePanelContent>
  );
}

/**
 * ProjectsPanelContent - Projects page adapted for panel display.
 */
export function ProjectsPanelContent() {
  return (
    <SidePanelContent panelId="projects">
      <ProjectsPage />
    </SidePanelContent>
  );
}
