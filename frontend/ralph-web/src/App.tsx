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
const DashboardPage = lazy(() => import("./pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then(m => ({ default: m.TasksPage })));
const TaskDetailPage = lazy(() => import("./pages/TaskDetailPage").then(m => ({ default: m.TaskDetailPage })));
const KanbanPage = lazy(() => import("./pages/KanbanPage").then(m => ({ default: m.KanbanPage })));
const BuilderPage = lazy(() => import("./pages/BuilderPage").then(m => ({ default: m.BuilderPage })));
const PlanPage = lazy(() => import("./pages/PlanPage").then(m => ({ default: m.PlanPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));

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
        <Route path="/dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
        <Route path="/tasks" element={<LazyPage><TasksPage /></LazyPage>} />
        <Route path="/tasks/:id" element={<LazyPage><TaskDetailPage /></LazyPage>} />
        <Route path="/kanban" element={<LazyPage><KanbanPage /></LazyPage>} />
        <Route path="/builder" element={<LazyPage><BuilderPage /></LazyPage>} />
        <Route path="/plan" element={<LazyPage><PlanPage /></LazyPage>} />
        <Route path="/settings" element={<LazyPage><SettingsPage /></LazyPage>} />
        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* Catch-all redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
