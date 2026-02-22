/**
 * Application Entry Point
 *
 * Sets up React Query, TRPC, and React Router providers, then renders the App.
 * Includes global ErrorBoundary for graceful error handling.
 * Initializes theme system on app load.
 */

import "./index.css";

import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { CommandPalette, ErrorBoundary } from "./components/shared";
import { useThemeStore, getResolvedTheme, applyTheme } from "./stores/themeStore";
import { initializeLocale } from "./stores/i18nStore";

/**
 * Theme initialization component.
 * Applies theme on mount and listens for system preference changes.
 */
function ThemeInit() {
  useEffect(() => {
    // Apply initial theme from store
    const { mode, updateResolved } = useThemeStore.getState();
    const resolved = getResolvedTheme(mode);
    applyTheme(resolved);

    // Initialize locale
    initializeLocale();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const { mode } = useThemeStore.getState();
      if (mode === "system") {
        updateResolved();
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return null;
}

function Root() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <StrictMode>
      <ErrorBoundary>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <ThemeInit />
              <App />
              <CommandPalette />
            </BrowserRouter>
          </QueryClientProvider>
        </trpc.Provider>
      </ErrorBoundary>
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
