/// <reference types="vitest" />
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var __dirname = dirname(fileURLToPath(import.meta.url));
var backendPort = process.env.RALPH_BACKEND_PORT || "3000";
var backendTarget = "http://localhost:".concat(backendPort);
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
    server: {
        port: 5173,
        host: true, // Listen on all interfaces (0.0.0.0)
        allowedHosts: ["studio", "localhost"],
        proxy: {
            "/rpc": {
                target: backendTarget,
                ws: true,
                changeOrigin: true,
            },
            "/health": {
                target: backendTarget,
                changeOrigin: true,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // React core
                    "vendor-react": ["react", "react-dom", "react-router-dom"],
                    // UI libraries
                    "vendor-ui": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@xyflow/react"],
                    // State and data
                    "vendor-data": ["zustand"],
                    // Utilities
                    "vendor-utils": ["date-fns", "clsx", "tailwind-merge"],
                },
            },
        },
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
        // Run tests in main process to avoid memory issues with workers
        // This is slower but more reliable for memory-constrained environments
        pool: "forks",
        poolOptions: {
            forks: {
                // Single fork mode - one test file at a time
                maxForks: 1,
                minForks: 1,
            },
        },
        // Increase test timeout for slower single-threaded execution
        testTimeout: 30000,
    },
});
