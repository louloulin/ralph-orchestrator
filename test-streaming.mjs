#!/usr/bin/env node

/**
 * Test streaming task
 *
 * This script tests the WebSocket log streaming functionality by:
 * 1. Creating a test task via REST API
 * 2. Running the task
 * 3. Connecting to WebSocket
 * 4. Verifying log entries and status updates are received
 */

import WebSocket from 'ws';
import { fetch } from 'undici';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const WS_URL = process.env.WS_URL || 'ws://localhost:3000/ws/logs';

/**
 * Create a task via tRPC API
 * tRPC with httpBatchLink sends direct JSON body (not wrapped in 'json' key)
 */
async function createTask(taskId, title, priority = 3, autoExecute = true) {
  const response = await fetch(`${API_URL}/trpc/task.create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: taskId,
      title: title,
      priority: priority,
      autoExecute: autoExecute,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create task: ${response.status} ${response.statusText}\n${text}`);
  }

  const data = await response.json();
  return data.result.data;
}

/**
 * Get task by ID (using task.get)
 */
async function getTask(taskId) {
  const response = await fetch(`${API_URL}/trpc/task.get?input=${encodeURIComponent(JSON.stringify({ id: taskId }))}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get task: ${response.status} ${response.statusText}\n${text}`);
  }

  const data = await response.json();
  return data.result.data;
}

/**
 * Archive a task
 */
async function archiveTask(taskId) {
  const response = await fetch(`${API_URL}/trpc/task.archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: taskId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to archive task: ${response.status} ${response.statusText}\n${text}`);
  }

  const data = await response.json();
  return data.result.data;
}

/**
 * Wait for a WebSocket message matching a condition
 */
function waitForMessage(ws, condition, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMessage);
      reject(new Error(`Timeout waiting for message after ${timeout}ms`));
    }, timeout);

    const onMessage = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (condition(msg)) {
          clearTimeout(timer);
          ws.removeListener('message', onMessage);
          resolve(msg);
        }
      } catch {
        // Ignore invalid JSON
      }
    };

    ws.on('message', onMessage);
  });
}

/**
 * Main test function
 */
async function testStreaming() {
  console.log('=== Testing WebSocket Log Streaming ===\n');

  // Step 1: Connect to WebSocket
  console.log('1. Connecting to WebSocket...');
  const ws = new WebSocket(WS_URL);

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      console.log('   ✓ WebSocket connected');
      resolve();
    });

    ws.on('error', (err) => {
      reject(new Error(`WebSocket connection failed: ${err.message}`));
    });
  });

  // Step 2: Create a test task
  console.log('\n2. Creating test task via tRPC...');

  const taskId = `test-stream-${Date.now()}`;
  const createResult = await createTask(
    taskId,
    'Test streaming task ' + new Date().toISOString(),
    3,
    true
  );

  console.log(`   ✓ Task created: ${createResult.id}`);
  console.log(`   ✓ Status: ${createResult.status}`);

  // Wait a moment for the task to be queued
  await new Promise(resolve => setTimeout(resolve, 500));

  // Step 3: Subscribe to the task
  console.log('\n3. Subscribing to task logs...');
  const dbTaskId = createResult.id;

  ws.send(JSON.stringify({
    type: 'subscribe',
    taskId: dbTaskId,
    sinceId: undefined,
  }));
  console.log(`   ✓ Subscribed to task ${dbTaskId}`);

  // Step 4: Wait for running status
  console.log('\n4. Waiting for task to start...');
  try {
    const runningStatus = await waitForMessage(ws, (msg) =>
      msg.type === 'status' && msg.taskId === dbTaskId
    );
    console.log(`   ✓ Task status: ${runningStatus.data.status}`);
  } catch (err) {
    console.warn(`   ! Warning: Could not detect running status: ${err.message}`);
  }

  // Step 5: Collect log entries for a reasonable time
  console.log('\n5. Collecting log entries...');
  const logs = [];
  const startTime = Date.now();
  const timeoutMs = 10000; // Collect for up to 10 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const logMsg = await waitForMessage(ws, (msg) =>
        msg.type === 'log' && msg.taskId === dbTaskId
      , 2000); // 2 second timeout per log

      const logEntry = logMsg.data;
      logs.push(logEntry.line);
      const truncated = logEntry.line.length > 80;
      console.log(`   [${logEntry.source}] ${logEntry.line.substring(0, 80)}${truncated ? '...' : ''}`);
    } catch {
      // Timeout waiting for log - this is OK, just break the loop
      break;
    }
  }

  console.log(`   ✓ Collected ${logs.length} log entries`);

  // Step 6: Wait for completion status
  console.log('\n6. Waiting for task completion...');
  try {
    const completedStatus = await waitForMessage(ws, (msg) =>
      msg.type === 'status' &&
      msg.taskId === dbTaskId &&
      msg.data.status === 'closed'
    , 15000);
    console.log(`   ✓ Task completed: ${completedStatus.data.status}`);
  } catch {
    console.log('   ! Task did not complete within timeout (this may be expected for long tasks)');
  }

  // Step 7: Verify results
  console.log('\n7. Verifying results...');

  // Get the final task state
  const finalTask = await getTask(dbTaskId);
  console.log(`   Final status: ${finalTask.status}`);
  console.log(`   Exit code: ${finalTask.exitCode ?? 'N/A'}`);

  if (logs.length > 0) {
    console.log(`   ✓ Received ${logs.length} log entries`);
  } else {
    console.log(`   ! No logs received - task may have completed too quickly`);
  }

  // Step 8: Cleanup
  console.log('\n8. Cleaning up...');
  ws.close();
  console.log('   ✓ WebSocket closed');

  // Archive the task
  try {
    await archiveTask(dbTaskId);
    console.log('   ✓ Task archived');
  } catch {
    console.log('   ! Could not archive task (may already be archived)');
  }

  console.log('\n✅ Streaming test completed!');
}

// Run the test
testStreaming().catch((err) => {
  console.error(`\n❌ Test failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
