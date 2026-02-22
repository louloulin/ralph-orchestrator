/**
 * Application Entry Point
 *
 * Sets up React Query, TRPC, and React Router providers, then renders the App.
 * Includes global ErrorBoundary for graceful error handling.
 */

import "./index.css";

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, createTRPCClient } from "./trpc";
import { App } from "./App";
import { CommandPalette, ErrorBoundary } from "./components/shared";

function Root() {
  // Create stable instances of QueryClient and TRPC client
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTRPCClient());

  return (
    <StrictMode>
      <ErrorBoundary>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
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
