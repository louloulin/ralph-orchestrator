/**
 * WebSocket Streaming E2E Integration Tests
 *
 * End-to-end tests for the WebSocket log streaming functionality.
 * Tests the full integration path from real WebSocket connection to
 * log broadcasting and backlog delivery.
 *
 * Tests:
 * - WebSocket connection lifecycle (connect, disconnect, error)
 * - Client subscription to tasks
 * - Real-time log broadcasting
 * - Backlog delivery for completed tasks
 * - Multiple concurrent clients
 * - Message format validation
 *
 * @see .ralph/specs/web-dashboard/websocket-streaming.spec.md
 * @see backend/ralph-web-server/src/api/LogBroadcaster.ts
 */

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { createServer } from "./server.js";
import { WebSocket } from "ws";
import { configureLogBroadcaster, resetLogBroadcaster } from "./LogBroadcaster.js";
import { TaskLogRepository } from "../repositories/TaskLogRepository.js";
import { initializeTestDatabase, getTestDatabase, closeTestDatabase } from "../db/testUtils.js";
import type { LogMessage } from "./LogBroadcaster.js";
import type { LogEntry } from "../runner/LogStream.js";

describe("WebSocket Streaming E2E Integration", () => {
  let serverUrl: string;
  let server: Awaited<ReturnType<typeof createServer>>;
  let logRepo: TaskLogRepository;
  const testClients: WebSocket[] = [];

  beforeEach(async () => {
    // Reset singleton before each test
    resetLogBroadcaster();

    // Initialize test database
    initializeTestDatabase();
    const db = getTestDatabase();
    logRepo = new TaskLogRepository(db);

    // Configure broadcaster with log repository
    configureLogBroadcaster({ logRepository: logRepo });

    // Create a test server on a random port
    server = await createServer({
      port: 0, // Use 0 to get a random available port
      logger: false, // Disable logging for tests
      db,
    });

    // Start the server
    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    // Parse the address to get the URL
    const port = address.split(":").pop() || "3000";
    serverUrl = `ws://127.0.0.1:${port}`;
  });

  afterAll(() => {
    // Cleanup: close test database
    closeTestDatabase();
    // Reset broadcaster
    resetLogBroadcaster();
  });

  /**
   * Helper: Create a WebSocket client connection
   */
  async function createClient(): Promise<WebSocket> {
    const client = new WebSocket(serverUrl + "/ws/logs");

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);

      client.on("open", () => {
        clearTimeout(timeout);
        testClients.push(client);
        resolve();
      });

      client.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return client;
  }

  /**
   * Helper: Receive messages from WebSocket
   */
  function receiveMessages(client: WebSocket, count: number): Promise<LogMessage[]> {
    return new Promise((resolve) => {
      const messages: LogMessage[] = [];
      const timeout = setTimeout(() => resolve(messages), 3000);

      client.on("message", (data: Buffer | string) => {
        try {
          const message = JSON.parse(data.toString()) as LogMessage;
          messages.push(message);

          if (messages.length >= count) {
            clearTimeout(timeout);
            resolve(messages);
          }
        } catch (err) {
          console.error("Failed to parse message:", err);
        }
      });
    });
  }

  /**
   * Helper: Send a subscription message
   */
  function subscribe(client: WebSocket, taskId: string, sinceId?: number): void {
    const message = sinceId !== undefined
      ? { type: "subscribe", taskId, sinceId }
      : { type: "subscribe", taskId };

    client.send(JSON.stringify(message));
  }

  /**
   * Helper: Send an unsubscription message
   */
  function unsubscribe(client: WebSocket, taskId: string): void {
    client.send(JSON.stringify({ type: "unsubscribe", taskId }));
  }

  /**
   * Helper: Clean up client
   */
  function cleanupClient(client: WebSocket): void {
    try {
      client.close();
    } catch {
      // Ignore
    }
  }

  /**
   * WebSocket Connection Tests
   */
  describe("Connection Lifecycle", () => {
    test("should accept WebSocket connection and send welcome message", async () => {
      const client = await createClient();
      const messages = await receiveMessages(client, 1);

      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe("status");
      expect(messages[0].data).toEqual({ status: "connected", clientId: expect.stringMatching(/^client-\d+-\d+$/) });

      cleanupClient(client);
    }, 10000);

    test("should send error for invalid message format", async () => {
      const client = await createClient();

      // Skip welcome message
      await receiveMessages(client, 1);

      // Send invalid JSON
      client.send("invalid json");

      const messages = await receiveMessages(client, 1);
      const errorMsg = messages.find((m) => m.type === "error");

      expect(errorMsg).toBeDefined();
      expect(errorMsg?.data).toEqual({ error: "Invalid message format. Expected JSON with type and taskId." });

      cleanupClient(client);
    }, 10000);
  });

  /**
   * Subscription Flow Tests
   */
  describe("Subscription Flow", () => {
    test("should subscribe to task and receive confirmation", async () => {
      const client = await createClient();

      // Skip welcome message
      await receiveMessages(client, 1);

      // Subscribe to a task
      const taskId = "test-task-001";
      subscribe(client, taskId);

      const messages = await receiveMessages(client, 1);
      const subscribeMsg = messages.find((m) => m.type === "status" && m.taskId === taskId);

      expect(subscribeMsg).toBeDefined();
      expect(subscribeMsg?.data).toEqual({ status: "subscribed" });

      cleanupClient(client);
    }, 10000);

    test("should unsubscribe from task and receive confirmation", async () => {
      const client = await createClient();

      // Skip welcome message
      await receiveMessages(client, 1);

      const taskId = "test-task-002";

      // Subscribe first
      subscribe(client, taskId);
      await receiveMessages(client, 1);

      // Unsubscribe
      unsubscribe(client, taskId);

      const messages = await receiveMessages(client, 1);
      const unsubscribeMsg = messages.find((m) => m.type === "status" && m.taskId === taskId && m.data.status === "unsubscribed");

      expect(unsubscribeMsg).toBeDefined();

      cleanupClient(client);
    }, 10000);

    test("should support multiple subscriptions from same client", async () => {
      const client = await createClient();

      // Skip welcome message
      await receiveMessages(client, 1);

      // Subscribe to multiple tasks
      subscribe(client, "task-1");
      subscribe(client, "task-2");
      subscribe(client, "task-3");

      const messages = await receiveMessages(client, 3);
      const subscribeMessages = messages.filter((m) => m.type === "status" && m.data.status === "subscribed");

      expect(subscribeMessages.length).toBe(3);

      cleanupClient(client);
    }, 10000);
  });

  /**
   * Backlog Delivery Tests
   */
  describe("Backlog Delivery", () => {
    test("should send full backlog to new subscriber", async () => {
      const taskId = "backlog-task-001";

      // Create some persisted logs
      logRepo.append(taskId, { line: "Starting task...", timestamp: new Date(), source: "stdout" });
      logRepo.append(taskId, { line: "Processing step 1", timestamp: new Date(), source: "stdout" });
      logRepo.append(taskId, { line: "Warning: minor issue", timestamp: new Date(), source: "stderr" });
      logRepo.append(taskId, { line: "Task completed", timestamp: new Date(), source: "stdout" });

      // Connect client and subscribe
      const client = await createClient();
      await receiveMessages(client, 1); // Skip welcome

      subscribe(client, taskId);

      const messages = await receiveMessages(client, 5); // 1 status + 4 logs
      const logMessages = messages.filter((m) => m.type === "log" && m.taskId === taskId);

      expect(logMessages.length).toBe(4);
      expect(logMessages[0].data.line).toBe("Starting task...");
      expect(logMessages[1].data.line).toBe("Processing step 1");
      expect(logMessages[2].data.line).toBe("Warning: minor issue");
      expect(logMessages[2].data.source).toBe("stderr");
      expect(logMessages[3].data.line).toBe("Task completed");

      cleanupClient(client);
    }, 10000);

    test("should send partial backlog when sinceId is provided", async () => {
      const taskId = "backlog-task-002";

      // Create logs with known IDs
      logRepo.append(taskId, { line: "Line 1", timestamp: new Date(), source: "stdout" }); // id: 1
      logRepo.append(taskId, { line: "Line 2", timestamp: new Date(), source: "stdout" }); // id: 2
      logRepo.append(taskId, { line: "Line 3", timestamp: new Date(), source: "stdout" }); // id: 3
      logRepo.append(taskId, { line: "Line 4", timestamp: new Date(), source: "stdout" }); // id: 4

      // Connect and subscribe with sinceId=2 (should get logs 3 and 4)
      const client = await createClient();
      await receiveMessages(client, 1); // Skip welcome

      subscribe(client, taskId, 2); // sinceId is exclusive, so we get logs AFTER id 2

      const messages = await receiveMessages(client, 3); // 1 status + 2 logs (ids 3 and 4)
      const logMessages = messages.filter((m) => m.type === "log" && m.taskId === taskId);

      expect(logMessages.length).toBe(2);
      expect(logMessages[0].data.line).toBe("Line 3");
      expect(logMessages[1].data.line).toBe("Line 4");

      cleanupClient(client);
    }, 10000);

    test("should send no backlog for task with no logs", async () => {
      const taskId = "empty-task-001";

      const client = await createClient();
      await receiveMessages(client, 1); // Skip welcome

      subscribe(client, taskId);

      const messages = await receiveMessages(client, 1); // Only status message
      const logMessages = messages.filter((m) => m.type === "log" && m.taskId === taskId);

      expect(logMessages.length).toBe(0);

      cleanupClient(client);
    }, 10000);
  });

  /**
   * Real-time Broadcasting Tests
   */
  describe("Real-time Broadcasting", () => {
    test("should broadcast logs to subscribed clients in real-time", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "broadcast-task-001";

      // Connect and subscribe client
      const client = await createClient();
      await receiveMessages(client, 1); // Skip welcome

      subscribe(client, taskId);
      await receiveMessages(client, 1); // Skip subscribe confirmation

      // Broadcast a log entry
      const logEntry: LogEntry = {
        line: "Real-time log message",
        timestamp: new Date(),
        source: "stdout",
      };
      broadcaster.broadcast(taskId, logEntry);

      // Receive the broadcast
      const messages = await receiveMessages(client, 1);
      const logMessage = messages[0];

      expect(logMessage.type).toBe("log");
      expect(logMessage.taskId).toBe(taskId);
      expect(logMessage.data.line).toBe("Real-time log message");
      expect(logMessage.data.source).toBe("stdout");

      cleanupClient(client);
    }, 10000);

    test("should broadcast to multiple subscribed clients", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "broadcast-task-002";

      // Connect multiple clients
      const client1 = await createClient();
      const client2 = await createClient();
      const client3 = await createClient();

      await receiveMessages(client1, 1); // Skip welcome
      await receiveMessages(client2, 1);
      await receiveMessages(client3, 1);

      // Subscribe all clients to the same task
      subscribe(client1, taskId);
      subscribe(client2, taskId);
      subscribe(client3, taskId);

      await receiveMessages(client1, 1); // Skip subscribe confirmation
      await receiveMessages(client2, 1);
      await receiveMessages(client3, 1);

      // Broadcast a log entry
      broadcaster.broadcast(taskId, {
        line: "Broadcast to all",
        timestamp: new Date(),
        source: "stdout",
      });

      // All clients should receive the log
      const [messages1, messages2, messages3] = await Promise.all([
        receiveMessages(client1, 1),
        receiveMessages(client2, 1),
        receiveMessages(client3, 1),
      ]);

      expect(messages1[0].data.line).toBe("Broadcast to all");
      expect(messages2[0].data.line).toBe("Broadcast to all");
      expect(messages3[0].data.line).toBe("Broadcast to all");

      cleanupClient(client1);
      cleanupClient(client2);
      cleanupClient(client3);
    }, 10000);

    test("should only broadcast to subscribed clients", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const task1 = "task-1";
      const task2 = "task-2";

      // Client 1 subscribes to task 1
      const client1 = await createClient();
      await receiveMessages(client1, 1);
      subscribe(client1, task1);
      await receiveMessages(client1, 1);

      // Client 2 subscribes to task 2
      const client2 = await createClient();
      await receiveMessages(client2, 1);
      subscribe(client2, task2);
      await receiveMessages(client2, 1);

      // Broadcast to task 1
      broadcaster.broadcast(task1, {
        line: "Message for task 1",
        timestamp: new Date(),
        source: "stdout",
      });

      // Client 1 should receive, client 2 should not
      const messages1 = await receiveMessages(client1, 1);

      // Wait a bit to ensure client 2 doesn't receive
      await new Promise((resolve) => setTimeout(resolve, 100));
      const messages2 = await receiveMessages(client2, 0); // No messages expected

      expect(messages1.length).toBe(1);
      expect(messages1[0].data.line).toBe("Message for task 1");
      expect(messages2.length).toBe(0);

      cleanupClient(client1);
      cleanupClient(client2);
    }, 10000);

    test("should broadcast status updates", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "status-task-001";

      const client = await createClient();
      await receiveMessages(client, 1);
      subscribe(client, taskId);
      await receiveMessages(client, 1);

      // Broadcast status
      broadcaster.broadcastStatus(taskId, "running");

      const messages = await receiveMessages(client, 1);

      expect(messages[0].type).toBe("status");
      expect(messages[0].taskId).toBe(taskId);
      expect(messages[0].data.status).toBe("running");

      cleanupClient(client);
    }, 10000);

    test("should broadcast errors", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "error-task-001";

      const client = await createClient();
      await receiveMessages(client, 1);
      subscribe(client, taskId);
      await receiveMessages(client, 1);

      // Broadcast error
      broadcaster.broadcastError(taskId, "Test error message");

      const messages = await receiveMessages(client, 1);

      expect(messages[0].type).toBe("error");
      expect(messages[0].taskId).toBe(taskId);
      expect(messages[0].data.error).toBe("Test error message");

      cleanupClient(client);
    }, 10000);
  });

  /**
   * Message Format Tests
   */
  describe("Message Format", () => {
    test("should send correctly formatted log messages", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "format-task-001";

      const client = await createClient();
      await receiveMessages(client, 1);
      subscribe(client, taskId);
      await receiveMessages(client, 1);

      broadcaster.broadcast(taskId, {
        line: "Format test log",
        timestamp: new Date("2024-01-15T10:30:00Z"),
        source: "stderr",
      });

      const messages = await receiveMessages(client, 1);
      const msg = messages[0];

      // Check all required fields
      expect(msg).toHaveProperty("type");
      expect(msg).toHaveProperty("taskId");
      expect(msg).toHaveProperty("data");
      expect(msg).toHaveProperty("timestamp");

      expect(msg.type).toBe("log");
      expect(msg.taskId).toBe(taskId);
      expect(typeof msg.timestamp).toBe("string");

      // Check log data structure
      expect(msg.data).toHaveProperty("id");
      expect(msg.data).toHaveProperty("line");
      expect(msg.data).toHaveProperty("timestamp");
      expect(msg.data).toHaveProperty("source");

      expect(msg.data.line).toBe("Format test log");
      expect(msg.data.source).toBe("stderr");

      cleanupClient(client);
    }, 10000);

    test("should handle UTF-8 characters in log messages", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "utf8-task-001";

      const client = await createClient();
      await receiveMessages(client, 1);
      subscribe(client, taskId);
      await receiveMessages(client, 1);

      const utf8Message = "Hello 世界 🌍 Привет";
      broadcaster.broadcast(taskId, {
        line: utf8Message,
        timestamp: new Date(),
        source: "stdout",
      });

      const messages = await receiveMessages(client, 1);

      expect(messages[0].data.line).toBe(utf8Message);

      cleanupClient(client);
    }, 10000);
  });

  /**
   * Edge Cases
   */
  describe("Edge Cases", () => {
    test("should handle multiple concurrent connections", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "concurrent-task-001";

      // Create 3 concurrent clients (reduced from 5 for speed)
      const clients = await Promise.all(
        Array.from({ length: 3 }, () => createClient())
      );

      // Subscribe all clients
      for (const client of clients) {
        await receiveMessages(client, 1);
        subscribe(client, taskId);
        await receiveMessages(client, 1);
      }

      // Broadcast a log
      broadcaster.broadcast(taskId, {
        line: "Concurrent test",
        timestamp: new Date(),
        source: "stdout",
      });

      // All clients should receive
      const messages = await Promise.all(
        clients.map((client) => receiveMessages(client, 1))
      );

      for (let i = 0; i < 3; i++) {
        expect(messages[i][0].data.line).toBe("Concurrent test");
        cleanupClient(clients[i]);
      }
    }, 20000);

    test("should handle client disconnect during active subscription", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "disconnect-task-001";

      const client = await createClient();
      await receiveMessages(client, 1);
      subscribe(client, taskId);
      await receiveMessages(client, 1);

      // Close connection while subscribed
      cleanupClient(client);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Broadcasting should not cause errors
      expect(() => {
        broadcaster.broadcast(taskId, {
          line: "After disconnect",
          timestamp: new Date(),
          source: "stdout",
        });
      }).not.toThrow();
    }, 10000);
  });

  /**
   * Persistence Integration Tests
   */
  describe("Persistence Integration", () => {
    test("should persist broadcasted logs and serve as backlog", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "persist-task-001";

      // Broadcast some logs
      broadcaster.broadcast(taskId, {
        line: "Log 1",
        timestamp: new Date(),
        source: "stdout",
      });

      broadcaster.broadcast(taskId, {
        line: "Log 2",
        timestamp: new Date(),
        source: "stderr",
      });

      broadcaster.broadcast(taskId, {
        line: "Log 3",
        timestamp: new Date(),
        source: "stdout",
      });

      // New client connecting should receive backlog
      const client = await createClient();
      await receiveMessages(client, 1);
      subscribe(client, taskId);

      const messages = await receiveMessages(client, 4); // 1 status + 3 logs
      const logMessages = messages.filter((m) => m.type === "log" && m.taskId === taskId);

      expect(logMessages.length).toBe(3);
      expect(logMessages[0].data.line).toBe("Log 1");
      expect(logMessages[1].data.line).toBe("Log 2");
      expect(logMessages[1].data.source).toBe("stderr");
      expect(logMessages[2].data.line).toBe("Log 3");

      cleanupClient(client);
    }, 10000);

    test("should include auto-incremented IDs in persisted logs", async () => {
      const { getLogBroadcaster } = await import("./LogBroadcaster.js");
      const broadcaster = getLogBroadcaster();

      const taskId = "id-task-001";

      // Broadcast multiple logs
      broadcaster.broadcast(taskId, {
        line: "First log",
        timestamp: new Date(),
        source: "stdout",
      });

      broadcaster.broadcast(taskId, {
        line: "Second log",
        timestamp: new Date(),
        source: "stdout",
      });

      broadcaster.broadcast(taskId, {
        line: "Third log",
        timestamp: new Date(),
        source: "stdout",
      });

      // Subscribe and receive backlog
      const client = await createClient();
      await receiveMessages(client, 1);
      subscribe(client, taskId);

      const messages = await receiveMessages(client, 4); // 1 status + 3 logs
      const logMessages = messages.filter((m) => m.type === "log" && m.taskId === taskId);

      // Check that IDs are sequential
      expect(logMessages[0].data.id).toBe(1);
      expect(logMessages[1].data.id).toBe(2);
      expect(logMessages[2].data.id).toBe(3);

      cleanupClient(client);
    }, 10000);
  });
});
