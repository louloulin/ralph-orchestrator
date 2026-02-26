/**
 * AppShell Component
 *
 * Main application layout with responsive sidebar and scrollable content area.
 * Uses React Router's Outlet for nested route rendering.
 * Provides the structural shell for the entire application.
 *
 * Mobile behavior:
 * - Sidebar is hidden by default, toggleable via hamburger menu
 * - Overlay backdrop appears when sidebar is open on mobile
 *
 * SidePanel system:
 * - Panels slide out from right for progressive disclosure
 * - Keyboard shortcuts: Cmd/Ctrl+1-5 to open panels, Esc/0 to close
 */

import { Outlet } from "react-router-dom";
import { Sidebar, MobileMenuButton } from "./Sidebar";
import { SidePanel, TasksPanelContent, PlanPanelContent, MonitorPanelContent, TeamsPanelContent, ProjectsPanelContent } from "@/components/panels";
import { ActiveLoopsDock } from "@/components/dock";
import { useUIStore } from "@/store";
import { useTranslation } from "@/hooks";
import { usePanelShortcuts, DEFAULT_PANEL_SHORTCUTS } from "@/hooks/usePanelShortcuts";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { t } = useTranslation();

  // Register keyboard shortcuts for panels
  usePanelShortcuts(DEFAULT_PANEL_SHORTCUTS);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:font-medium"
      >
        {t("common.skipToContent")}
      </a>

      {/* Mobile header - visible on small screens */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 bg-card border-b border-border">
        <MobileMenuButton />
        <span className="font-bold text-lg tracking-tight">Ralph</span>
        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Mobile overlay backdrop */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - fixed on desktop, overlay on mobile */}
      <Sidebar />

      {/* Main content area - renders active route via Outlet */}
      <main
        id="main-content"
        className={cn(
          "flex-1 overflow-auto",
          "pt-14 md:pt-0", // Add top padding on mobile for header
          "pb-20 md:pb-20" // Add bottom padding for dock
        )}
        role="main"
        aria-label={t("a11y.mainContent")}
      >
        <div className="p-4 md:p-6">
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

      {/* SidePanel System - slide-out panels for progressive disclosure */}
      <SidePanel width={600} showBackdrop closeOnBackdropClick>
        <TasksPanelContent />
        <PlanPanelContent />
        <MonitorPanelContent />
        <TeamsPanelContent />
        <ProjectsPanelContent />
      </SidePanel>

      {/* ActiveLoopsDock - persistent bottom dock for multi-task visibility */}
      <ActiveLoopsDock />
    </div>
  );
}
