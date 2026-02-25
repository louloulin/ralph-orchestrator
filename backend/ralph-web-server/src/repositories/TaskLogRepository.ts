/**
 * TaskLogRepository
 *
 * Data access layer for persistent task log storage.
 */

import { and, asc, eq, gt } from "drizzle-orm";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { taskLogs, TaskLog } from "../db/schema";
import * as schema from "../db/schema";
import type { LogEntry } from "../runner/LogStream";
import { getRunResult } from "../db/connection";

export interface ListTaskLogsOptions {
  /** Only return logs with id greater than this value */
  afterId?: number;
  /** Limit number of log entries returned */
  limit?: number;
  /** Filter by project ID (P5-2: Project Isolation) */
  projectId?: string;
}

export class TaskLogRepository {
  private db: BunSQLiteDatabase<typeof schema>;

  constructor(db: BunSQLiteDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Append a single log entry for a task.
   * Returns the inserted log id.
   */
  append(taskId: string, entry: LogEntry, projectId?: string): number {
    const timestamp = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);

    const result = getRunResult(
      this.db
        .insert(taskLogs)
        .values({
          taskId,
          projectId: projectId ?? null,
          timestamp,
          source: entry.source,
          line: entry.line,
        })
        .run()
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * List logs for a given task, ordered by id ascending.
   */
  listByTaskId(taskId: string, options: ListTaskLogsOptions = {}): TaskLog[] {
    const { afterId, limit, projectId } = options;

    const conditions = [eq(taskLogs.taskId, taskId)];

    if (afterId !== undefined) {
      conditions.push(gt(taskLogs.id, afterId));
    }

    if (projectId !== undefined) {
      conditions.push(eq(taskLogs.projectId, projectId));
    }

    // @ts-expect-error - drizzle spread operator typing issue with dynamic conditions
    const query = this.db.select().from(taskLogs).where(and(...conditions)).orderBy(asc(taskLogs.id));

    if (limit !== undefined) {
      return query.limit(limit).all();
    }

    return query.all();
  }

  /**
   * Delete all task logs.
   * Returns the number of deleted rows.
   */
  deleteAll(): number {
    const result = getRunResult(this.db.delete(taskLogs).run());
    return result.changes;
  }
}
