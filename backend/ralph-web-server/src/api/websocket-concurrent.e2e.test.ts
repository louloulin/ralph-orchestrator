/**
 * E2E WebSocket Concurrent Subscribers Test
 *
 * Tests multiple clients receiving same logs, isolation between different taskIds,
 * and unsubscription behavior.
 */

import { test, describe, beforeEach, afterEach, expect } from "bun:test";
import { WebSocket } from "ws";
import { FastifyInstance } from "fastify";
import { createServer } from "./server";
import { getLogBroadcaster, configureLogBroadcaster, resetLogBroadcaster, LogMessage } from "./LogBroadcaster";
import { TaskLogRepository } from "../repositories/TaskLogRepository";
import { initializeTestDatabase, getTestDatabase, closeTestDatabase } from "../db/testUtils";

let portCounter = 49500;
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

async function collectMessages(ws: WebSocket, duration: number): Promise<LogMessage[]> {
  return new Promise((resolve) => {
    const messages: LogMessage[] = [];
    const handler = (data: Buffer) => {
      try {
        messages.push(JSON.parse(data.toString()) as LogMessage);
      } catch {
        // Ignore invalid JSON
      }
    };
    ws.on("message", handler);
    setTimeout(() => {
      ws.removeListener("message", handler);
      resolve(messages);
    }, duration);
  });
}

describe("E2E WebSocket Concurrent Subscribers", () => {
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
    await new Promise(r => setTimeout(r, 100));
  });

  afterEach(async () => {
    resetLogBroadcaster();
    closeTestDatabase();
    await new Promise(r => setTimeout(r, 100));
  });

  test("multiple clients receive same logs", async () => {
    const taskId = `test-${Date.now()}`;

    // Create multiple clients
    const client1 = await createWebSocketClient(serverPort);
    const client2 = await createWebSocketClient(serverPort);
    const client3 = await createWebSocketClient(serverPort);

    // Wait for "connected" messages
    await new Promise(r => setTimeout(r, 200));

    // All clients subscribe to same task
    client1.send(JSON.stringify({ type: "subscribe", taskId }));
    client2.send(JSON.stringify({ type: "subscribe", taskId }));
    client3.send(JSON.stringify({ type: "subscribe", taskId }));

    // Wait for subscriptions to process
    await new Promise(r => setTimeout(r, 200));

    // Broadcast logs
    const broadcaster = getLogBroadcaster();
    broadcaster.broadcast(taskId, { id: 1, line: "Log 1", timestamp: new Date(), source: "stdout" });
    broadcaster.broadcast(taskId, { id: 2, line: "Log 2", timestamp: new Date(), source: "stdout" });
    broadcaster.broadcast(taskId, { id: 3, line: "Log 3", timestamp: new Date(), source: "stdout" });

    // Collect messages from all clients
    const [messages1, messages2, messages3] = await Promise.all([
      collectMessages(client1, 500),
      collectMessages(client2, 500),
      collectMessages(client3, 500),
    ]);

    // Extract log messages
    const logs1 = messages1.filter(m => m.type === "log");
    const logs2 = messages2.filter(m => m.type === "log");
    const logs3 = messages3.filter(m => m.type === "log");

    // All clients should receive same logs
    expect(logs1.length).toBe(3);
    expect(logs2.length).toBe(3);
    expect(logs3.length).toBe(3);

    const lines1 = logs1.map(m => m.data.line);
    const lines2 = logs2.map(m => m.data.line);
    const lines3 = logs3.map(m => m.data.line);

    expect(lines1).toEqual(["Log 1", "Log 2", "Log 3"]);
    expect(lines2).toEqual(["Log 1", "Log 2", "Log 3"]);
    expect(lines3).toEqual(["Log 1", "Log 2", "Log 3"]);

    client1.terminate();
    client2.terminate();
    client3.terminate();
  });

  test("clients receive backlog upon subscription", async () => {
    const taskId = `test-${Date.now()}`;

    // Add logs to repository BEFORE clients connect
    logRepo.append(taskId, { line: "Backlog 1", timestamp: new Date(), source: "stdout" });
    logRepo.append(taskId, { line: "Backlog 2", timestamp: new Date(), source: "stdout" });

    // Create multiple clients
    const client1 = await createWebSocketClient(serverPort);
    const client2 = await createWebSocketClient(serverPort);

    // Wait for "connected" messages
    await new Promise(r => setTimeout(r, 200));

    // Both clients subscribe - should receive backlog
    client1.send(JSON.stringify({ type: "subscribe", taskId }));
    client2.send(JSON.stringify({ type: "subscribe", taskId }));

    // Collect messages
    const [messages1, messages2] = await Promise.all([
      collectMessages(client1, 500),
      collectMessages(client2, 500),
    ]);

    // Both should receive backlog
    const logs1 = messages1.filter(m => m.type === "log");
    const logs2 = messages2.filter(m => m.type === "log");

    expect(logs1.length).toBe(2);
    expect(logs2.length).toBe(2);
    expect(logs1[0].data.line).toBe("Backlog 1");
    expect(logs1[1].data.line).toBe("Backlog 2");
    expect(logs2[0].data.line).toBe("Backlog 1");
    expect(logs2[1].data.line).toBe("Backlog 2");

    client1.terminate();
    client2.terminate();
  });

  test("isolation between different taskIds", async () => {
    const task1 = `test-${Date.now()}-1`;
    const task2 = `test-${Date.now()}-2`;

    // Create clients for different tasks
    const client1 = await createWebSocketClient(serverPort);
    const client2 = await createWebSocketClient(serverPort);

    // Wait for "connected" messages
    await new Promise(r => setTimeout(r, 200));

    // Subscribe to different tasks
    client1.send(JSON.stringify({ type: "subscribe", taskId: task1 }));
    client2.send(JSON.stringify({ type: "subscribe", taskId: task2 }));

    // Wait for subscriptions to process
    await new Promise(r => setTimeout(r, 200));

    const broadcaster = getLogBroadcaster();

    // Broadcast to task1 only
    broadcaster.broadcast(task1, { id: 1, line: "Task 1 log", timestamp: new Date(), source: "stdout" });

    // Collect messages from client1
    const messages1 = await collectMessages(client1, 300);
    const logs1 = messages1.filter(m => m.type === "log");
    expect(logs1.length).toBe(1);
    expect(logs1[0].data.line).toBe("Task 1 log");

    // Broadcast to task2 only
    broadcaster.broadcast(task2, { id: 1, line: "Task 2 log", timestamp: new Date(), source: "stdout" });

    // Collect messages from client2
    const messages2 = await collectMessages(client2, 300);
    const logs2 = messages2.filter(m => m.type === "log");
    expect(logs2.length).toBe(1);
    expect(logs2[0].data.line).toBe("Task 2 log");

    client1.terminate();
    client2.terminate();
  });

  test("unsubscription behavior removes only that client", async () => {
    const taskId = `test-${Date.now()}`;

    // Create three clients
    const client1 = await createWebSocketClient(serverPort);
    const client2 = await createWebSocketClient(serverPort);
    const client3 = await createWebSocketClient(serverPort);

    // Wait for "connected" messages
    await new Promise(r => setTimeout(r, 200));

    // All subscribe
    client1.send(JSON.stringify({ type: "subscribe", taskId }));
    client2.send(JSON.stringify({ type: "subscribe", taskId }));
    client3.send(JSON.stringify({ type: "subscribe", taskId }));

    // Wait for subscriptions to register
    await new Promise(r => setTimeout(r, 100));

    const broadcaster = getLogBroadcaster();
    expect(broadcaster.hasSubscribers(taskId)).toBe(true);
    expect(broadcaster.getSubscriberCount(taskId)).toBe(3);

    // Unsubscribe client1
    client1.send(JSON.stringify({ type: "unsubscribe", taskId }));
    await new Promise(r => setTimeout(r, 100));
    client1.terminate();

    // Wait for unsubscription to process
    await new Promise(r => setTimeout(r, 100));

    // Should still have subscribers (client2 and client3)
    expect(broadcaster.hasSubscribers(taskId)).toBe(true);
    expect(broadcaster.getSubscriberCount(taskId)).toBe(2);

    // Broadcast - client2 and client3 should receive
    broadcaster.broadcast(taskId, { id: 1, line: "After unsubscribe", timestamp: new Date(), source: "stdout" });

    // Collect messages
    const [messages2, messages3] = await Promise.all([
      collectMessages(client2, 300),
      collectMessages(client3, 300),
    ]);

    const logs2 = messages2.filter(m => m.type === "log");
    const logs3 = messages3.filter(m => m.type === "log");

    expect(logs2.length).toBe(1);
    expect(logs3.length).toBe(1);
    expect(logs2[0].data.line).toBe("After unsubscribe");
    expect(logs3[0].data.line).toBe("After unsubscribe");

    client2.terminate();
    client3.terminate();
  });

  test("all clients unsubscribe removes subscribers", async () => {
    const taskId = `test-${Date.now()}`;

    // Create two clients
    const client1 = await createWebSocketClient(serverPort);
    const client2 = await createWebSocketClient(serverPort);

    // Wait for "connected" messages
    await new Promise(r => setTimeout(r, 200));

    // Both subscribe
    client1.send(JSON.stringify({ type: "subscribe", taskId }));
    client2.send(JSON.stringify({ type: "subscribe", taskId }));

    // Wait for subscriptions to register
    await new Promise(r => setTimeout(r, 100));

    const broadcaster = getLogBroadcaster();
    expect(broadcaster.hasSubscribers(taskId)).toBe(true);
    expect(broadcaster.getSubscriberCount(taskId)).toBe(2);

    // Unsubscribe both
    client1.send(JSON.stringify({ type: "unsubscribe", taskId }));
    client2.send(JSON.stringify({ type: "unsubscribe", taskId }));

    // Wait for unsubscription to process
    await new Promise(r => setTimeout(r, 200));

    // Should have no subscribers now
    expect(broadcaster.hasSubscribers(taskId)).toBe(false);
    expect(broadcaster.getSubscriberCount(taskId)).toBe(0);

    client1.terminate();
    client2.terminate();
  });

  test("high concurrency - 10 clients receive same logs", async () => {
    const taskId = `test-${Date.now()}`;

    // Create 10 clients
    const clients: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      const client = await createWebSocketClient(serverPort);
      client.send(JSON.stringify({ type: "subscribe", taskId }));
      clients.push(client);
    }

    // Wait for all subscriptions to register
    await new Promise(r => setTimeout(r, 300));

    // Broadcast multiple logs
    const broadcaster = getLogBroadcaster();
    for (let i = 0; i < 5; i++) {
      broadcaster.broadcast(taskId, { id: i + 1, line: `Log ${i}`, timestamp: new Date(), source: "stdout" });
    }

    // All clients should receive all 5 logs
    const allMessages = await Promise.all(clients.map(c => collectMessages(c, 1000)));

    for (const messages of allMessages) {
      const logs = messages.filter(m => m.type === "log");
      expect(logs.length).toBe(5);
      const lines = logs.map(m => m.data.line);
      expect(lines).toEqual(["Log 0", "Log 1", "Log 2", "Log 3", "Log 4"]);
    }

    // Clean up
    clients.forEach(c => c.terminate());
  });
});