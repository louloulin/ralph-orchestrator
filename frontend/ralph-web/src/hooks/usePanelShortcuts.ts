/**
 * usePanelShortcuts Hook
 *
 * Registers keyboard shortcuts for panel navigation.
 * - Cmd/Ctrl+1-5: Open specific panels
 * - Cmd/Ctrl+0: Close active panel
 * - Esc: Close active panel (handled by SidePanel component)
 *
 * Works across platforms (Meta on Mac, Ctrl on Windows/Linux).
 */

import { useEffect } from "react";
import { usePanelStore, PanelId } from "@/stores/panelStore";

interface PanelShortcutConfig {
  /** Panel ID to open */
  panelId: PanelId;
  /** Keyboard key number (1-5) */
  key: number;
}

/**
 * Hook to register keyboard shortcuts for panel navigation.
 *
 * @param configs Array of panel shortcut configurations
 */
export function usePanelShortcuts(configs: PanelShortcutConfig[]) {
  const { openPanel, closePanel, activePanel } = usePanelStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Check for Cmd/Ctrl + number (1-5)
      if (modKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();

        const keyNum = parseInt(e.key, 10);

        // Find matching panel config
        const config = configs.find((c) => c.key === keyNum);

        if (config) {
          // Toggle panel: open if closed, close if already active
          if (activePanel === config.panelId) {
            closePanel();
          } else {
            openPanel(config.panelId);
          }
        }
      }

      // Cmd/Ctrl + 0 closes active panel
      if (modKey && e.key === "0") {
        e.preventDefault();
        closePanel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [configs, openPanel, closePanel, activePanel]);
}

/**
 * Default panel shortcuts configuration.
 * Maps keyboard shortcuts to panel IDs.
 */
export const DEFAULT_PANEL_SHORTCUTS: PanelShortcutConfig[] = [
  { panelId: "tasks", key: 1 },
  { panelId: "plan", key: 2 },
  { panelId: "monitor", key: 3 },
  { panelId: "teams", key: 4 },
  { panelId: "projects", key: 5 },
];
