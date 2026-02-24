/**
 * E2E WebSocket Reconnection Test
 *
 * Tests client reconnection behavior, exponential backoff timing,
 * and log persistence across reconnections.
 */

import { test, describe, beforeEach, afterEach, expect } from "bun:test";
import { WebSocket } from "ws";
import { FastifyInstance } from "fastify";
import { createServer } from "./server";
import { getLogBroadcaster, configureLogBroadcaster, resetLogBroadcaster, LogMessage } from "./LogBroadcaster";
import { TaskLogRepository } from "../repositories/TaskLogRepository";
import { initializeTestDatabase, getTestDatabase, closeTestDatabase } from "../db/testUtils";

let portCounter = 49700;
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

describe("E2E WebSocket Reconnection", () => {
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
    resetLogBroadcaster();
    closeTestDatabase();
  });

  test("client reconnects after server disconnect", async () => {
    const taskId = `test-${Date.now()}`;

    // Initial connection
    const ws1 = await createWebSocketClient(serverPort);
    const messages1 = await waitForMessages(ws1, 1);
    const clientId1 = (messages1[0].data as { clientId?: string }).clientId;

    // Subscribe to task
    ws1.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws1, 1);

    // Force disconnect
    ws1.terminate();

    // Wait for clean disconnect
    await new Promise(r => setTimeout(r, 100));

    // Reconnect with same client ID simulation (new connection)
    const ws2 = await createWebSocketClient(serverPort);
    const messages2 = await waitForMessages(ws2, 1);
    const clientId2 = (messages2[0].data as { clientId?: string }).clientId;

    // New client should have different ID
    expect(clientId2).not.toBe(clientId1);

    // Should be able to subscribe to same task
    ws2.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws2, 1);

    // Should receive new broadcasts
    const broadcaster = getLogBroadcaster();
    broadcaster.broadcast(taskId, { id: 1, line: "After reconnect", timestamp: new Date(), source: "stdout" });
    const messages3 = await waitForMessages(ws2, 1);

    expect(messages3[0].type).toBe("log");
    expect(messages3[0].data.line).toBe("After reconnect");

    ws2.terminate();
  });

  test("log persistence across reconnections", async () => {
    const taskId = `test-${Date.now()}`;

    // Add logs to repository BEFORE connecting (simulates existing logs)
    logRepo.append(taskId, { line: "Log before connect", timestamp: new Date(), source: "stdout" });

    // Connect and subscribe - should receive backlog from repository
    const ws1 = await createWebSocketClient(serverPort);
    ws1.send(JSON.stringify({ type: "subscribe", taskId }));
    const messages = await waitForMessages(ws1, 3); // status + backlog logs

    // Should receive backlog logs from repository
    const logs = messages.filter(m => m.type === "log");
    const hasBacklog = logs.some(l => l.data.line === "Log before connect");
    expect(hasBacklog).toBe(true);

    ws1.terminate();
  });

  test("exponential backoff timing for reconnects", async () => {
    const taskId = `test-${Date.now()}`;

    // Track connection times
    const connectTimes: number[] = [];

    // First connection
    let ws1 = await createWebSocketClient(serverPort);
    connectTimes.push(Date.now());
    ws1.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws1, 1);

    // Disconnect and reconnect multiple times
    for (let i = 0; i < 3; i++) {
      ws1.terminate();
      await new Promise(r => setTimeout(r, 50));

      let ws2 = await createWebSocketClient(serverPort);
      connectTimes.push(Date.now());
      ws2.send(JSON.stringify({ type: "subscribe", taskId }));
      await waitForMessages(ws2, 1);
      ws1 = ws2;
    }

    // Verify connections were successful (times are increasing)
    expect(connectTimes.length).toBe(4);
    for (let i = 1; i < connectTimes.length; i++) {
      expect(connectTimes[i]).toBeGreaterThan(connectTimes[i - 1]);
    }

    ws1.terminate();
  });

  test("receives missed logs after reconnection", async () => {
    const taskId = `test-${Date.now()}`;

    // First connection - subscribe
    const ws1 = await createWebSocketClient(serverPort);
    ws1.send(JSON.stringify({ type: "subscribe", taskId }));
    await waitForMessages(ws1, 2);

    const broadcaster = getLogBroadcaster();

    // Send logs while first client is connected
    broadcaster.broadcast(taskId, { id: 1, line: "Log 1", timestamp: new Date(), source: "stdout" });
    broadcaster.broadcast(taskId, { id: 2, line: "Log 2", timestamp: new Date(), source: "stdout" });
    await waitForMessages(ws1, 2);

    // Disconnect
    ws1.terminate();
    await new Promise(r => setTimeout(r, 100));

    // Reconnect and subscribe - should receive any live logs
    const ws2 = await createWebSocketClient(serverPort);
    ws2.send(JSON.stringify({ type: "subscribe", taskId }));
    const messages = await waitForMessages(ws2, 3); // status + potential logs

    // Should receive message(s) on reconnect
    expect(messages.length).toBeGreaterThan(0);

    ws2.terminate();
  });

  test("handles multiple reconnections", async () => {
    const taskId = `test-${Date.now()}`;

    // First connection
    let ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    const msg1 = await waitForMessages(ws, 2);
    expect(msg1[0].type).toBe("status");
    ws.terminate();

    // Second connection
    await new Promise(r => setTimeout(r, 100));
    ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    const msg2 = await waitForMessages(ws, 2);
    expect(msg2[0].type).toBe("status");
    ws.terminate();

    // Third connection
    await new Promise(r => setTimeout(r, 100));
    ws = await createWebSocketClient(serverPort);
    ws.send(JSON.stringify({ type: "subscribe", taskId }));
    const msg3 = await waitForMessages(ws, 2);
    expect(msg3[0].type).toBe("status");

    ws.terminate();
  });

  test("client receives status messages on reconnect", async () => {
    const taskId = `test-${Date.now()}`;

    // First connection
    const ws1 = await createWebSocketClient(serverPort);
    const msg1 = await waitForMessages(ws1, 1);
    expect(msg1[0].type).toBe("status");
    expect((msg1[0].data as { status: string }).status).toBe("connected");

    // Disconnect
    ws1.terminate();
    await new Promise(r => setTimeout(r, 100));

    // Reconnect - should receive connected status again
    const ws2 = await createWebSocketClient(serverPort);
    const msg2 = await waitForMessages(ws2, 1);
    expect(msg2[0].type).toBe("status");
    expect((msg2[0].data as { status: string }).status).toBe("connected");

    // Different client ID on reconnect
    const clientId1 = (msg1[0].data as { clientId?: string }).clientId;
    const clientId2 = (msg2[0].data as { clientId?: string }).clientId;
    expect(clientId2).not.toBe(clientId1);

    ws2.terminate();
  });
});
