/**
 * App Component
 *
 * Application routing configuration using React Router.
 * Uses lazy loading for route-level code splitting.
 */

import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout";
import { PageLoading } from "./components/shared";

// Lazy-loaded page components for code splitting
const ChatPage = lazy(() => import("./pages/ChatPage").then(m => ({ default: m.ChatPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then(m => ({ default: m.TasksPage })));
const TaskDetailPage = lazy(() => import("./pages/TaskDetailPage").then(m => ({ default: m.TaskDetailPage })));
const BuilderPage = lazy(() => import("./pages/BuilderPage").then(m => ({ default: m.BuilderPage })));
const PlanPage = lazy(() => import("./pages/PlanPage").then(m => ({ default: m.PlanPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage").then(m => ({ default: m.MonitoringPage })));
const TeamsPage = lazy(() => import("./pages/TeamsPage").then(m => ({ default: m.TeamsPage })));
const CheckpointsPage = lazy(() => import("./pages/CheckpointsPage").then(m => ({ default: m.default })));
const HealingPage = lazy(() => import("./pages/HealingPage").then(m => ({ default: m.HealingPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then(m => ({ default: m.ProjectsPage })));

/**
 * Wrapper component for lazy-loaded routes with Suspense
 */
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}

export function App() {
  return (
    <Routes>
      {/* AppShell provides the layout, Outlet renders the matched route */}
      <Route element={<AppShell />}>
        {/* Chat is the new AI-native main interface */}
        <Route path="/chat" element={<LazyPage><ChatPage /></LazyPage>} />
        {/* Panels and supporting pages */}
        <Route path="/tasks" element={<LazyPage><TasksPage /></LazyPage>} />
        <Route path="/tasks/:id" element={<LazyPage><TaskDetailPage /></LazyPage>} />
        <Route path="/builder" element={<LazyPage><BuilderPage /></LazyPage>} />
        <Route path="/plan" element={<LazyPage><PlanPage /></LazyPage>} />
        <Route path="/settings" element={<LazyPage><SettingsPage /></LazyPage>} />
        <Route path="/monitoring" element={<LazyPage><MonitoringPage /></LazyPage>} />
        <Route path="/checkpoints" element={<LazyPage><CheckpointsPage /></LazyPage>} />
        <Route path="/healing" element={<LazyPage><HealingPage /></LazyPage>} />
        <Route path="/projects" element={<LazyPage><ProjectsPage /></LazyPage>} />
        <Route path="/teams" element={<LazyPage><TeamsPage /></LazyPage>} />
        {/* Redirect root to chat */}
        <Route path="/" element={<Navigate to="/chat" replace />} />
        {/* Catch-all redirect to chat */}
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Route>
    </Routes>
  );
}
