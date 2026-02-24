/**
 * Sidebar Component
 *
 * Responsive navigation sidebar with nav items and toggle button.
 * Uses Zustand store for state persistence across page refreshes.
 * Navigation items use React Router NavLink for proper routing.
 *
 * Desktop: Collapsible sidebar with expand/collapse toggle
 * Mobile: Hidden by default, slides in as overlay when toggled
 */

import { LayoutDashboard, ListTodo, PanelLeftClose, PanelLeft, Workflow, Settings, Columns3, Menu, X, Activity, Users } from "lucide-react";
import { NavItem } from "./NavItem";
import { useUIStore } from "@/store";
import { ThemeToggleMinimal, LocaleSwitcherMinimal } from "@/components/shared";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";

/** Ralph hat logo matching favicon */
function RalphLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z" />
      <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
      <path d="M4 15v-3a6 6 0 0 1 6-6" />
      <path d="M14 6a6 6 0 0 1 6 6v3" />
    </svg>
  );
}

/** Navigation items configuration with route paths */
const NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { to: "/tasks", icon: ListTodo, labelKey: "nav.tasks" },
  { to: "/kanban", icon: Columns3, labelKey: "nav.kanban" },
  { to: "/teams", icon: Users, labelKey: "nav.teams" },
  { to: "/monitoring", icon: Activity, labelKey: "nav.monitoring" },
  { to: "/builder", icon: Workflow, labelKey: "nav.builder" },
  { to: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;

/**
 * Mobile menu button component - hamburger icon
 */
export function MobileMenuButton() {
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { t } = useTranslation();

  return (
    <button
      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
      aria-expanded={mobileMenuOpen}
      className={cn(
        "flex items-center justify-center w-10 h-10 rounded-md",
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "transition-colors"
      )}
    >
      {mobileMenuOpen ? (
        <X className="h-5 w-5" />
      ) : (
        <Menu className="h-5 w-5" />
      )}
    </button>
  );
}

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { t } = useTranslation();

  // Close mobile menu when nav item is clicked
  const handleNavClick = () => {
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  };

  return (
    <aside
      aria-label={t("a11y.mainNavigation")}
      className={cn(
        "flex flex-col h-full bg-card border-r border-border transition-all duration-200",
        // Desktop: always visible with toggleable width
        "hidden md:flex",
        sidebarOpen ? "w-56" : "w-14",
        // Mobile: overlay when open, hidden when closed
        "fixed md:relative z-50 md:z-auto",
        mobileMenuOpen && "flex w-64"
      )}
    >
      {/* Logo and brand */}
      <div
        className={cn(
          "flex items-center h-14 px-3 border-b border-border",
          sidebarOpen ? "gap-3 justify-between" : "justify-center"
        )}
      >
        <div className="flex items-center gap-3">
          <RalphLogo className="h-6 w-6 text-primary flex-shrink-0" />
          {sidebarOpen && <span className="font-bold text-lg tracking-tight">RO</span>}
        </div>
        {sidebarOpen && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
            Alpha
          </span>
        )}
      </div>

      {/* Navigation items */}
      <nav aria-label={t("a11y.primaryNavigation")} className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={t(item.labelKey)}
            collapsed={!sidebarOpen}
            onClick={handleNavClick}
          />
        ))}
      </nav>

      {/* Toggle button at bottom */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => {
            toggleSidebar();
            if (mobileMenuOpen) setMobileMenuOpen(false);
          }}
          aria-label={sidebarOpen ? t("nav.collapseSidebar") : t("nav.expandSidebar")}
          aria-expanded={sidebarOpen}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !sidebarOpen && "justify-center px-2"
          )}
          title={sidebarOpen ? t("nav.collapseSidebar") : t("nav.expandSidebar")}
        >
          {sidebarOpen ? (
            <>
              <PanelLeftClose className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">{t("nav.collapse")}</span>
            </>
          ) : (
            <PanelLeft className="h-5 w-5 flex-shrink-0" />
          )}
        </button>

        {/* Theme and locale toggles - only in collapsed mode */}
        {!sidebarOpen && (
          <div className="mt-1 space-y-1">
            <ThemeToggleMinimal className="w-full" />
            <LocaleSwitcherMinimal className="w-full" />
          </div>
        )}
      </div>

      {/* Footer with theme and locale toggles (expanded mode) and command palette hint */}
      {sidebarOpen && (
        <div className="p-3 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("theme.title")}</span>
            <ThemeToggleMinimal />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("settings.language")}</span>
            <LocaleSwitcherMinimal />
          </div>
          <div className="text-xs text-muted-foreground text-center">
            {t("commandPalette.hint")}
          </div>
        </div>
      )}
    </aside>
  );
}
