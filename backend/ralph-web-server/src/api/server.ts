/**
 * Fastify Server with TRPC Integration and WebSocket Support
 *
 * HTTP server providing:
 * - /health endpoint for health checks
 * - /trpc/* endpoints for TRPC API
 * - /ws/logs WebSocket endpoint for real-time log streaming
 * - Static file serving for frontend assets
 * - SPA routing (fallback to index.html)
 * - CORS support for cross-origin requests
 */

import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { fastifyTRPCPlugin, FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { appRouter, createContext } from "./trpc";
import type { AppRouter } from "./trpc";
import { getDatabase } from "../db/connection";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema";
import { getLogBroadcaster } from "./LogBroadcaster";
import { registerRestRoutes } from "./rest";
import { registerRpcHandler } from "./rpc";
import { TaskBridge } from "../services/TaskBridge";
import { LoopsManager } from "../services/LoopsManager";
import { PlanningService } from "../services/PlanningService";
import { LoopSupervisor } from "../services/LoopSupervisor";
import { AgentTeamsService } from "../services/AgentTeamsService";
import { MetricStore } from "../services/MetricStore";
import { AlertEngine } from "../services/AlertEngine";
import * as fs from "fs";
import * as path from "path";

export interface ServerOptions {
  /** Port to listen on (default: 3000) */
  port?: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** Optional database instance (creates one if not provided) */
  db?: BunSQLiteDatabase<typeof schema>;
  /** Enable request logging (default: true) */
  logger?: boolean;
  /** TaskBridge for task execution (optional) */
  taskBridge?: TaskBridge;
  /** LoopsManager for loop operations (optional) */
  loopsManager?: LoopsManager;
  /** PlanningService for planning sessions (optional) */
  planningService?: PlanningService;
  /** LoopSupervisor for process daemon operations (optional) */
  loopSupervisor?: LoopSupervisor;
  /** AgentTeamsService for multi-agent operations (optional) */
  agentTeamsService?: AgentTeamsService;
  /** MetricStore for metrics collection (optional) */
  metricStore?: MetricStore;
  /** AlertEngine for alert evaluation (optional) */
  alertEngine?: AlertEngine;
  /** Frontend dist directory for serving static files */
  frontendDist?: string;
}

/**
 * Create and configure a Fastify server with TRPC
 */
export async function createServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const { port = 3000, host = "0.0.0.0", db = getDatabase(), logger = true, taskBridge, loopsManager, planningService, loopSupervisor, agentTeamsService, metricStore, alertEngine, frontendDist } = options;

  const server = Fastify({ logger });

  // Register CORS
  await server.register(cors, {
    origin: true, // Allow all origins in development
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // Register WebSocket plugin
  await server.register(websocket);

  // Determine frontend dist directory
  // When running from compiled binary, look for embedded assets
  // When running in dev mode, use the frontend dist directory
  const distPath = frontendDist || path.join(process.cwd(), "dist");
  const hasFrontend = fs.existsSync(distPath);

  if (hasFrontend) {
    console.log(`Serving frontend from: ${distPath}`);

    // Register static file serving
    server.register(require("@fastify/static"), {
      root: distPath,
      prefix: "/", // Serve from root
      decorateReply: false,
    });

    // SPA fallback: serve index.html for non-API routes
    server.setNotFoundHandler(async (request, reply) => {
      const url = request.url;

      // Don't fallback for API routes
      if (url.startsWith("/api/") || url.startsWith("/trpc/") || url.startsWith("/ws/") || url.startsWith("/rpc/")) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }

      // For all other routes, serve index.html (SPA routing)
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        reply.type("text/html").send(fs.readFileSync(indexPath, "utf-8"));
      } else {
        reply.code(404).send({ error: "Frontend not found" });
      }
    });
  } else {
    console.log("Frontend dist directory not found, running API-only mode");
  }

  // Health check endpoint
  server.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // WebSocket endpoint for log streaming
  server.get("/ws/logs", { websocket: true }, (socket, _req) => {
    const broadcaster = getLogBroadcaster();
    const clientId = broadcaster.addClient(socket);

    // Handle incoming messages from client
    socket.on("message", (rawMessage: Buffer | string) => {
      try {
        const message = JSON.parse(rawMessage.toString());

        if (message.type === "subscribe" && message.taskId) {
          const sinceId = typeof message.sinceId === "number" ? message.sinceId : undefined;
          broadcaster.subscribe(clientId, message.taskId, { sinceId });
        } else if (message.type === "unsubscribe" && message.taskId) {
          broadcaster.unsubscribe(clientId, message.taskId);
        }
      } catch (err) {
        console.warn(`[WebSocket] Invalid message from client ${clientId}:`, err);
        socket.send(
          JSON.stringify({
            type: "error",
            taskId: "",
            data: { error: "Invalid message format. Expected JSON with type and taskId." },
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    // Send welcome message
    socket.send(
      JSON.stringify({
        type: "status",
        taskId: "",
        data: { status: "connected", clientId },
        timestamp: new Date().toISOString(),
      })
    );
  });

  // Register TRPC plugin
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: () => createContext(db, taskBridge, loopsManager, planningService, loopSupervisor, agentTeamsService, metricStore, alertEngine),
      onError: ({ path, error }) => {
        console.error(`TRPC Error on ${path}:`, error);
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  // Register REST API routes at /api/v1/*
  const ctx = createContext(db, taskBridge, loopsManager, planningService, loopSupervisor, agentTeamsService, metricStore, alertEngine);
  await registerRestRoutes(server, ctx);

  // Register custom RPC handler at /rpc/v1
  await registerRpcHandler(server, ctx);

  return server;
}

/**
 * Start the server and listen on the specified port
 */
export async function startServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const { port = 3000, host = "0.0.0.0" } = options;

  const server = await createServer(options);

  try {
    const address = await server.listen({ port, host });
    console.log(`Server listening at ${address}`);
    return server;
  } catch (err) {
    server.log.error(err);
    throw err;
  }
}

// Export for direct CLI usage
export { appRouter } from "./trpc";
export type { AppRouter } from "./trpc";
