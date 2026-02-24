/**
 * E2E WebSocket Streaming Test
 *
 * End-to-end integration test for WebSocket log streaming.
 * Tests the complete flow from server to client.
 */

import { test, describe, beforeEach, afterEach, expect } from "bun:test";
import { WebSocket } from "ws";
import { FastifyInstance } from "fastify";
import { createServer } from "./server";
import { getLogBroadcaster, configureLogBroadcaster, resetLogBroadcaster, LogMessage } from "./LogBroadcaster";
import { TaskLogRepository } from "../repositories/TaskLogRepository";
import { initializeTestDatabase, getTestDatabase, closeTestDatabase } from "../db/testUtils";

let portCounter = 49000;
function getUniquePort(): number {
  return portCounter++;
}

async function createWebSocketClient(port: number): Promise<WebSocket> {
  const url = `ws://localhost:${port}/ws/logs`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket connection timeout"));
      }
    }, 5000);

    ws.on("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function waitForMessages(ws: WebSocket, count: number, timeout = 5000): Promise<LogMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: LogMessage[] = [];
    let timeoutId: NodeJS.Timeout;

    const handler = (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as LogMessage;
        messages.push(message);
        if (messages.length >= count) {
          ws.removeListener("message", handler);
          clearTimeout(timeoutId);
          resolve(messages);
        }
      } catch {
        // Ignore invalid JSON
      }
    };

    ws.on("message", handler);
    timeoutId = setTimeout(() => {
      ws.removeListener("message", handler);
      if (messages.length > 0) resolve(messages);
      else reject(new Error("Timeout waiting for messages"));
    }, timeout);
  });
}

describe("E2E WebSocket Streaming", () => {
  let server: FastifyInstance;
  let logRepo: TaskLogRepository;
  let serverPort: number;

  beforeEach(async () => {
    serverPort = getUniquePort();
    initializeTestDatabase();
    const db = getTestDatabase();
    logRepo = new TaskLogRepository(db);
    configureLogBroadcaster({ logRepository: logRepo });
    server = await createServer({ port: serverPort, host: "127.0.0.1", logger: false, db });
    await server.listen({ port: serverPort, host: "127.0.0.1" });
    await new Promise(r => setTimeout(r, 50));
  });

  afterEach(async () => {
    // Skip closing server as it may hang - tests run sequentially anyway
    resetLogBroadcaster();
    closeTestDatabase();
  });

  test("client connects and receives welcome message", async () => {
    const ws = await createWebSocketClient(serverPort);
    const messages = await waitForMessages(ws, 1);
    ws.terminate();
    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe("status");
    expect((messages[0].data as { status: string }).status).toBe("connected");
  });

  test("client subscribes and receives backlog", async () => {
    const taskId = `test-${Date.now()}`;
    logRepo.append(taskId, { line: "Log 1", timestamp: new Date(), source: "stdout" });
    logRepo.append(taskId, { line: "Log 2", timestamp: new Date(), source: "stdout" });
    const ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    const messages = await waitForMessages(ws, 4);
    ws.terminate();
    const logs = messages.filter(m => m.type === "log");
    expect(logs.length).toBe(2);
  });

  test("receives real-time logs from broadcaster", async () => {
    const taskId = `test-${Date.now()}`;
    const ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws, 2);
    const broadcaster = getLogBroadcaster();
    broadcaster.broadcast(taskId, { id: 1, line: "Test log", timestamp: new Date(), source: "stdout" });
    const messages = await waitForMessages(ws, 1);
    ws.terminate();
    expect(messages[0].type).toBe("log");
    expect(messages[0].data.line).toBe("Test log");
  });

  test("receives all message types", async () => {
    const taskId = `test-${Date.now()}`;
    const ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws, 2);
    const broadcaster = getLogBroadcaster();
    broadcaster.broadcast(taskId, { id: 1, line: "Info", timestamp: new Date(), source: "stdout" });
    broadcaster.broadcastStatus(taskId, "running");
    broadcaster.broadcastError(taskId, "Error");
    broadcaster.broadcastEvent(taskId, { ts: new Date().toISOString(), topic: "test.event", payload: {} });
    const messages = await waitForMessages(ws, 4);
    ws.terminate();
    const types = new Set(messages.map(m => m.type));
    expect(types.has("log")).toBe(true);
    expect(types.has("status")).toBe(true);
    expect(types.has("error")).toBe(true);
    expect(types.has("event")).toBe(true);
  });

  test("messages delivered in order", async () => {
    const taskId = `test-${Date.now()}`;
    const ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws, 2);
    const broadcaster = getLogBroadcaster();
    for (let i = 0; i < 20; i++) {
      broadcaster.broadcast(taskId, { id: i + 1, line: `Log ${i}`, timestamp: new Date(), source: "stdout" });
    }
    const messages = await waitForMessages(ws, 20);
    ws.terminate();
    const logs = messages.filter(m => m.type === "log");
    expect(logs.length).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(logs[i].data.line).toBe(`Log ${i}`);
    }
  });

  test("receives backlog plus real-time logs", async () => {
    const taskId = `test-${Date.now()}`;
    logRepo.append(taskId, { line: "Old", timestamp: new Date(), source: "stdout" });
    const ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws, 3);
    const broadcaster = getLogBroadcaster();
    broadcaster.broadcast(taskId, { id: 2, line: "New", timestamp: new Date(), source: "stdout" });
    const messages = await waitForMessages(ws, 1);
    ws.terminate();
    expect(messages[0].type).toBe("log");
    expect(messages[0].data.line).toBe("New");
  });

  test("unsubscribes correctly", async () => {
    const taskId = `test-${Date.now()}`;
    const ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws, 2);
    const broadcaster = getLogBroadcaster();
    broadcaster.broadcast(taskId, { id: 1, line: "Before", timestamp: new Date(), source: "stdout" });
    await waitForMessages(ws, 1);
    ws.send(JSON.stringify({ type: "unsubscribe", taskId }));
    await waitForMessages(ws, 1);
    broadcaster.broadcast(taskId, { id: 2, line: "After", timestamp: new Date(), source: "stdout" });
    await new Promise(r => setTimeout(r, 50));
    expect(broadcaster.hasSubscribers(taskId)).toBe(false);
    ws.terminate();
  });

  test("connection includes clientId", async () => {
    const ws = await createWebSocketClient(serverPort);
    const messages = await waitForMessages(ws, 1);
    ws.terminate();
    expect(messages[0].type).toBe("status");
    const data = messages[0].data as { status: string; clientId?: string };
    expect(data.clientId).toBeDefined();
  });

  test("handles invalid messages gracefully", async () => {
    const ws = await createWebSocketClient(serverPort);
    await waitForMessages(ws, 1);
    ws.send("invalid");
    const messages = await waitForMessages(ws, 1);
    ws.terminate();
    expect(messages[0].type).toBe("error");
  });
});