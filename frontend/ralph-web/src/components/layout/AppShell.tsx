/**
 * AppShell Component
 *
 * Main application layout with fixed sidebar and scrollable content area.
 * Uses React Router's Outlet for nested route rendering.
 * Provides the structural shell for the entire application.
 */

import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Fixed sidebar */}
      <Sidebar />

      {/* Main content area - renders active route via Outlet */}
      <main id="main-content" className="flex-1 overflow-auto" role="main" aria-label="Main content">
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Screen reader announcer for dynamic content */}
      <div
        id="sr-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
    </div>
  );
}
