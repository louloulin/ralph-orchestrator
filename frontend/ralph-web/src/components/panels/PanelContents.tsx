/**
 * Panel Content Wrappers
 *
 * Wrappers that render specialized panel components optimized for side panel display.
 * Each component provides a compact, focused interface adapted from its page counterpart.
 */

import { SidePanelContent } from "./SidePanel";
import { TasksPanel } from "./TasksPanel";
import { PlanPanel } from "./PlanPanel";
import { MonitorPanel } from "./MonitorPanel";
import { TeamsPage } from "@/pages/TeamsPage";
import { ProjectsPage } from "@/pages/ProjectsPage";

/**
 * TasksPanelContent - Tasks page adapted for panel display.
 * Uses specialized TasksPanel component optimized for side panel.
 */
export function TasksPanelContent() {
  return (
    <SidePanelContent panelId="tasks">
      <TasksPanel />
    </SidePanelContent>
  );
}

/**
 * PlanPanelContent - Planning page adapted for panel display.
 * Uses specialized PlanPanel component optimized for side panel.
 */
export function PlanPanelContent() {
  return (
    <SidePanelContent panelId="plan">
      <PlanPanel />
    </SidePanelContent>
  );
}

/**
 * MonitorPanelContent - Monitoring page adapted for panel display.
 * Uses specialized MonitorPanel component optimized for side panel.
 */
export function MonitorPanelContent() {
  return (
    <SidePanelContent panelId="monitor">
      <MonitorPanel />
    </SidePanelContent>
  );
}

/**
 * TeamsPanelContent - Teams page adapted for panel display.
 * TODO: Create specialized TeamsPanel component similar to TasksPanel.
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
 * TODO: Create specialized ProjectsPanel component similar to TasksPanel.
 */
export function ProjectsPanelContent() {
  return (
    <SidePanelContent panelId="projects">
      <ProjectsPage />
    </SidePanelContent>
  );
}
