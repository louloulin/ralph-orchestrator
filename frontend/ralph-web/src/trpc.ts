import { useMutation, useQuery, useQueryClient, type QueryKey, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import { RpcClientError, rpcCall } from "./rpc/client";

type QueryOptions<TResult = any> = Omit<UseQueryOptions<TResult, RpcClientError>, "queryKey" | "queryFn">;
type MutationOptions<TResult = any, TInput = any> = Omit<UseMutationOptions<TResult, RpcClientError, TInput>, "mutationFn">;

interface QueryProcedure<TInput, TResult = any> {
  useQuery: (input?: TInput, options?: QueryOptions<TResult>) => any;
}

interface MutationProcedure<TInput, TResult = any> {
  useMutation: (options?: MutationOptions<TResult, TInput>) => any;
}

const QUERY_NAMESPACE = "rpc-v1";

function keyFor(scope: string, method: string, input?: unknown): QueryKey {
  return [QUERY_NAMESPACE, scope, method, input ?? null] as const;
}

function prefixFor(scope: string, method: string): QueryKey {
  return [QUERY_NAMESPACE, scope, method] as const;
}

function createQueryProcedure<TInput, TRpcResult, TResult>(config: {
  scope: string;
  method: string;
  mapInput?: (input?: TInput) => unknown;
  mapResult?: (result: TRpcResult, input?: TInput) => TResult;
}): QueryProcedure<TInput, TResult> {
  return {
    useQuery: (input?: TInput, options?: QueryOptions<TResult>) =>
      useQuery<TResult, RpcClientError>({
        queryKey: keyFor(config.scope, config.method, input),
        queryFn: async () => {
          const params = config.mapInput ? config.mapInput(input) : ((input as unknown) ?? {});
          const result = await rpcCall<TRpcResult>(config.method, params, { mutating: false });
          if (config.mapResult) {
            return config.mapResult(result, input);
          }
          return result as unknown as TResult;
        },
        ...(options ?? {}),
      }),
  };
}

function createMutationProcedure<TInput, TRpcResult, TResult>(config: {
  method: string;
  mapInput?: (input: TInput) => unknown;
  mapResult?: (result: TRpcResult, input: TInput) => TResult;
}): MutationProcedure<TInput, TResult> {
  return {
    useMutation: (options?: MutationOptions<TResult, TInput>) =>
      useMutation<TResult, RpcClientError, TInput>({
        mutationFn: async (input: TInput) => {
          const params = config.mapInput ? config.mapInput(input) : (input as unknown);
          const result = await rpcCall<TRpcResult>(config.method, params);
          if (config.mapResult) {
            return config.mapResult(result, input);
          }
          return result as unknown as TResult;
        },
        ...(options ?? {}),
      }),
  };
}

async function listLoopsWithMergeState(input?: { includeTerminal?: boolean }) {
  const result = await rpcCall<{ loops: Array<Record<string, unknown>> }>("loop.list", input ?? {}, {
    mutating: false,
  });

  const loops = result.loops ?? [];
  const enriched = await Promise.all(
    loops.map(async (loop) => {
      const location = typeof loop.location === "string" ? loop.location : "";
      const id = typeof loop.id === "string" ? loop.id : undefined;

      if (!id || location === "(in-place)") {
        return loop;
      }

      try {
        const mergeState = await rpcCall<{ enabled: boolean; reason?: string }>(
          "loop.merge_button_state",
          { id },
          { mutating: false }
        );

        return {
          ...loop,
          mergeButtonState: {
            state: mergeState.enabled ? "active" : "blocked",
            reason: mergeState.reason,
          },
        };
      } catch {
        return loop;
      }
    })
  );

  return enriched;
}

function useRpcUtils() {
  const queryClient = useQueryClient();

  const invalidatePrefix = (scope: string, method: string) =>
    queryClient.invalidateQueries({ queryKey: prefixFor(scope, method) });

  const invalidateExact = (scope: string, method: string, input?: unknown) =>
    queryClient.invalidateQueries({
      queryKey: keyFor(scope, method, input),
      exact: true,
    });

  return {
    task: {
      list: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("task", "task.list")
            : invalidateExact("task", "task.list", input),
      },
      ready: {
        invalidate: () => invalidatePrefix("task", "task.ready"),
      },
      get: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("task", "task.get")
            : invalidateExact("task", "task.get", input),
      },
    },
    loops: {
      list: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("loop", "loop.list")
            : invalidateExact("loop", "loop.list", input),
      },
      managerStatus: {
        invalidate: () => invalidatePrefix("loop", "loop.status"),
      },
    },
    planning: {
      list: {
        invalidate: () => invalidatePrefix("planning", "planning.list"),
      },
      get: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("planning", "planning.get")
            : invalidateExact("planning", "planning.get", input),
      },
    },
    config: {
      get: {
        invalidate: () => invalidatePrefix("config", "config.get"),
      },
    },
    presets: {
      list: {
        invalidate: () => invalidatePrefix("preset", "preset.list"),
      },
    },
    collection: {
      list: {
        invalidate: () => invalidatePrefix("collection", "collection.list"),
      },
      get: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("collection", "collection.get")
            : invalidateExact("collection", "collection.get", input),
      },
    },
    healing: {
      getEvents: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("healing", "healing.getEvents")
            : invalidateExact("healing", "healing.getEvents", input),
      },
      getPolicy: {
        invalidate: () => invalidatePrefix("healing", "healing.getPolicy"),
      },
      getKnownFixes: {
        invalidate: () => invalidatePrefix("healing", "healing.getKnownFixes"),
      },
      getCircuitBreakerStatus: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("healing", "healing.getCircuitBreakerStatus")
            : invalidateExact("healing", "healing.getCircuitBreakerStatus", input),
      },
    },
    skills: {
      list: {
        invalidate: () => invalidatePrefix("skills", "skills.list"),
      },
      get: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("skills", "skills.get")
            : invalidateExact("skills", "skills.get", input),
      },
      getCategories: {
        invalidate: () => invalidatePrefix("skills", "skills.getCategories"),
      },
    },
    checkpoint: {
      list: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("checkpoint", "checkpoint.list")
            : invalidateExact("checkpoint", "checkpoint.list", input),
      },
      stats: {
        invalidate: () => invalidatePrefix("checkpoint", "checkpoint.stats"),
      },
    },
    session: {
      list: {
        invalidate: () => invalidatePrefix("session", "session.list"),
      },
      getMeta: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("session", "session.getMeta")
            : invalidateExact("session", "session.getMeta", input),
      },
      get: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("session", "session.get")
            : invalidateExact("session", "session.get", input),
      },
    },
    teams: {
      list: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("teams", "teams.list")
            : invalidateExact("teams", "teams.list", input),
      },
      get: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("teams", "teams.get")
            : invalidateExact("teams", "teams.get", input),
      },
      stats: {
        invalidate: () => invalidatePrefix("teams", "teams.stats"),
      },
      suggestTask: {
        invalidate: (input?: unknown) =>
          input === undefined
            ? invalidatePrefix("teams", "teams.suggestTask")
            : invalidateExact("teams", "teams.suggestTask", input),
      },
    },
  };
}

export const trpc = {
  useUtils: useRpcUtils,

  task: {
    list: createQueryProcedure<{ status?: string; includeArchived?: boolean; projectId?: string }, { tasks: any[] }, any[]>({
      scope: "task",
      method: "task.list",
      mapInput: (input) => input ?? {},
      mapResult: (result) => result.tasks ?? [],
    }),

    search: createQueryProcedure<{
      query: string;
      status?: string[];
      projectId?: string;
      includeArchived?: boolean;
      includeClosed?: boolean;
      dateRange?: { start?: string; end?: string };
    }, { tasks: any[] }, any[]>({
      scope: "task",
      method: "task.search",
      mapInput: (input) => input ?? {},
      mapResult: (result) => result.tasks ?? [],
    }),

    get: createQueryProcedure<{ id: string }, { task: any }, any>({
      scope: "task",
      method: "task.get",
      mapInput: (input) => input ?? {},
      mapResult: (result) => result.task,
    }),

    ready: createQueryProcedure<void, { tasks: any[] }, any[]>({
      scope: "task",
      method: "task.ready",
      mapInput: () => ({}),
      mapResult: (result) => result.tasks ?? [],
    }),

    create: createMutationProcedure<
      {
        id: string;
        title: string;
        status?: string;
        priority?: number;
        blockedBy?: string | null;
        autoExecute?: boolean;
        preset?: string;
      },
      { task: any },
      any
    >({
      method: "task.create",
      mapInput: (input) => {
        const { preset: _preset, ...rest } = input;
        return rest;
      },
      mapResult: (result) => result.task,
    }),

    run: createMutationProcedure<{ id: string }, { success: boolean; queuedTaskId?: string; task?: any }, {
      success: boolean;
      queuedTaskId?: string;
      task?: any;
    }>({
      method: "task.run",
    }),

    runAll: createMutationProcedure<void, { enqueued: number; errors: string[] }, { enqueued: number; errors: string[] }>({
      method: "task.run_all",
      mapInput: () => ({}),
    }),

    retry: createMutationProcedure<{ id: string }, { success: boolean; queuedTaskId?: string; task?: any }, {
      success: boolean;
      queuedTaskId?: string;
      task?: any;
    }>({
      method: "task.retry",
    }),

    executionStatus: createQueryProcedure<{ id: string }, { isQueued: boolean; queuePosition?: number; runnerPid?: number }, {
      isQueued: boolean;
      queuePosition?: number;
      runnerPid?: number;
    }>({
      scope: "task",
      method: "task.status",
    }),

    cancel: createMutationProcedure<{ id: string }, { task: any }, { success: boolean; task: any }>({
      method: "task.cancel",
      mapResult: (result) => ({ success: true, task: result.task }),
    }),

    update: createMutationProcedure<
      { id: string; title?: string; status?: string; priority?: number; blockedBy?: string | null },
      { task: any },
      any
    >({
      method: "task.update",
      mapResult: (result) => result.task,
    }),

    close: createMutationProcedure<{ id: string }, { task: any }, any>({
      method: "task.close",
      mapResult: (result) => result.task,
    }),

    archive: createMutationProcedure<{ id: string }, { task: any }, any>({
      method: "task.archive",
      mapResult: (result) => result.task,
    }),

    unarchive: createMutationProcedure<{ id: string }, { task: any }, any>({
      method: "task.unarchive",
      mapResult: (result) => result.task,
    }),

    delete: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "task.delete",
    }),

    clearAll: createMutationProcedure<void, { success: boolean }, { success: boolean; deletedTasks: number; deletedLogs: number }>({
      method: "task.clear",
      mapInput: () => ({}),
      mapResult: (result) => ({
        success: Boolean(result.success),
        deletedTasks: 0,
        deletedLogs: 0,
      }),
    }),

    getFileChanges: createQueryProcedure<{ id: string }, { files: any[] }, any[]>({
      scope: "task",
      method: "task.get_file_changes",
      mapInput: (input) => input ?? {},
      mapResult: (result) => (result as any)?.files ?? [],
    }),

    getFileChangesStats: createQueryProcedure<{ id: string }, { stats: any }, any>({
      scope: "task",
      method: "task.get_file_changes_stats",
      mapInput: (input) => input ?? {},
      mapResult: (result) => (result as any)?.stats ?? null,
    }),
  },

  loops: {
    list: {
      useQuery: ((input?: { includeTerminal?: boolean }, options?: QueryOptions<any[]>) =>
        useQuery<any[], RpcClientError>({
          queryKey: keyFor("loop", "loop.list", input),
          queryFn: () => listLoopsWithMergeState(input),
          ...(options ?? {}),
        })) as any,
    },

    managerStatus: createQueryProcedure<void, { running: boolean; intervalMs: number; lastProcessedAt?: string }, {
      running: boolean;
      intervalMs: number;
      lastProcessedAt?: string;
    }>({
      scope: "loop",
      method: "loop.status",
      mapInput: () => ({}),
    }),

    process: createMutationProcedure<void, { success: boolean }, { success: boolean }>({
      method: "loop.process",
      mapInput: () => ({}),
    }),

    prune: createMutationProcedure<void, { success: boolean }, { success: boolean }>({
      method: "loop.prune",
      mapInput: () => ({}),
    }),

    retry: createMutationProcedure<{ id: string; steeringInput?: string }, { success: boolean }, { success: boolean }>({
      method: "loop.retry",
    }),

    discard: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "loop.discard",
    }),

    stop: createMutationProcedure<{ id: string; force?: boolean }, { success: boolean }, { success: boolean }>({
      method: "loop.stop",
    }),

    merge: createMutationProcedure<{ id: string; force?: boolean }, { success: boolean }, { success: boolean }>({
      method: "loop.merge",
    }),

    triggerMergeTask: createMutationProcedure<{ loopId: string }, { success: boolean; taskId: string; queuedTaskId?: string }, {
      success: boolean;
      taskId: string;
      queuedTaskId?: string;
    }>({
      method: "loop.trigger_merge_task",
    }),

    mergeButtonState: createQueryProcedure<{ id: string }, { enabled: boolean; reason?: string }, {
      state: "active" | "blocked";
      reason?: string;
    }>({
      scope: "loop",
      method: "loop.merge_button_state",
      mapResult: (result) => ({
        state: result.enabled ? "active" : "blocked",
        reason: result.reason,
      }),
    }),
  },

  planning: {
    list: createQueryProcedure<void, { sessions: any[] }, any[]>({
      scope: "planning",
      method: "planning.list",
      mapInput: () => ({}),
      mapResult: (result) => result.sessions ?? [],
    }),

    get: createQueryProcedure<{ id: string }, { session: any }, any>({
      scope: "planning",
      method: "planning.get",
      mapResult: (result) => result.session,
    }),

    start: createMutationProcedure<{ prompt: string }, { session: { id: string } }, { sessionId: string }>({
      method: "planning.start",
      mapResult: (result) => ({ sessionId: result.session.id }),
    }),

    respond: createMutationProcedure<
      { sessionId: string; promptId: string; response: string },
      { success: boolean },
      { success: boolean }
    >({
      method: "planning.respond",
    }),

    resume: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "planning.resume",
    }),

    delete: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "planning.delete",
    }),

    getArtifact: createQueryProcedure<{ sessionId: string; filename: string }, { filename: string; content: string }, {
      filename: string;
      content: string;
    }>({
      scope: "planning",
      method: "planning.get_artifact",
    }),
  },

  // Conversation sessions (P1-1, P1-2)
  session: {
    list: createQueryProcedure<{ status?: "active" | "archived" | "completed" }, { sessions: any[] }, any[]>({
      scope: "session",
      method: "session.list",
      mapResult: (result) => result.sessions ?? [],
    }),

    getMeta: createQueryProcedure<{ id: string }, { session: any }, any>({
      scope: "session",
      method: "session.getMeta",
      mapResult: (result) => result,
    }),

    get: createQueryProcedure<{ id: string }, { session: any }, any>({
      scope: "session",
      method: "session.get",
      mapResult: (result) => result,
    }),

    create: createMutationProcedure<{ name: string }, { session: any }, any>({
      method: "session.create",
      mapResult: (result) => result,
    }),

    update: createMutationProcedure<{ id: string; name?: string; status?: "active" | "archived" | "completed" }, { session: any }, any>({
      method: "session.update",
      mapResult: (result) => result,
    }),

    delete: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "session.delete",
    }),

    appendMessage: createMutationProcedure<{ sessionId: string; role: "user" | "assistant" | "system"; content: string }, { message: any }, any>({
      method: "session.appendMessage",
      mapResult: (result) => result,
    }),
  },

  config: {
    get: createQueryProcedure<void, { raw: string; parsed: Record<string, unknown> }, { raw: string; parsed: Record<string, unknown> }>({
      scope: "config",
      method: "config.get",
      mapInput: () => ({}),
    }),

    update: createMutationProcedure<{ content: string }, { success: boolean; parsed: Record<string, unknown> }, {
      success: boolean;
      parsed: Record<string, unknown>;
    }>({
      method: "config.update",
    }),
  },

  presets: {
    list: createQueryProcedure<void, { presets: any[] }, any[]>({
      scope: "preset",
      method: "preset.list",
      mapInput: () => ({}),
      mapResult: (result) => result.presets ?? [],
    }),
  },

  collection: {
    list: createQueryProcedure<void, { collections: any[] }, any[]>({
      scope: "collection",
      method: "collection.list",
      mapInput: () => ({}),
      mapResult: (result) => result.collections ?? [],
    }),

    get: createQueryProcedure<{ id: string }, { collection: any }, any>({
      scope: "collection",
      method: "collection.get",
      mapResult: (result) => result.collection,
    }),

    create: createMutationProcedure<{ name: string; description?: string; graph?: any }, { collection: any }, any>({
      method: "collection.create",
      mapResult: (result) => result.collection,
    }),

    update: createMutationProcedure<{ id: string; name?: string; description?: string; graph?: any }, { collection: any }, any>({
      method: "collection.update",
      mapResult: (result) => result.collection,
    }),

    delete: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "collection.delete",
    }),

    exportYaml: createQueryProcedure<{ id: string }, { yaml: string }, { yaml: string }>({
      scope: "collection",
      method: "collection.export",
    }),

    importYaml: createMutationProcedure<{ yaml: string; name: string; description?: string }, { collection: any }, any>({
      method: "collection.import",
      mapResult: (result) => result.collection,
    }),
  },

  project: {
    list: createQueryProcedure<void, any[], any[]>({
      scope: "project",
      method: "project.list",
      mapInput: () => ({}),
      mapResult: (result) => result ?? [],
    }),

    get: createQueryProcedure<{ id: string }, any, any>({
      scope: "project",
      method: "project.get",
      mapResult: (result) => result,
    }),

    getActive: createQueryProcedure<void, any, any>({
      scope: "project",
      method: "project.getActive",
      mapInput: () => ({}),
    }),

    create: createMutationProcedure<{ name: string; path: string; description?: string }, any, any>({
      method: "project.create",
      mapResult: (result) => result,
    }),

    update: createMutationProcedure<{ id: string; name?: string; description?: string }, any, any>({
      method: "project.update",
      mapResult: (result) => result,
    }),

    delete: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "project.delete",
    }),

    validatePath: createMutationProcedure<{ path: string }, { valid: boolean; error?: string }, { valid: boolean; error?: string }>({
      method: "project.validatePath",
    }),

    setActive: createMutationProcedure<{ id: string }, any, any>({
      method: "project.setActive",
      mapResult: (result) => result,
    }),
  },

  process: {
    list: createQueryProcedure<void, { processes: any[] }, any[]>({
      scope: "process",
      method: "process.list",
      mapInput: () => ({}),
      mapResult: (result) => result?.processes ?? [],
    }),

    get: createQueryProcedure<{ id: string }, any, any>({
      scope: "process",
      method: "process.get",
      mapResult: (result) => result,
    }),

    getHealth: createQueryProcedure<{ id: string }, any, any>({
      scope: "process",
      method: "process.getHealth",
      mapResult: (result) => result,
    }),

    start: createMutationProcedure<{ id: string; config?: any }, { success: boolean; process?: any }, { success: boolean; process?: any }>({
      method: "process.start",
    }),

    stop: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "process.stop",
    }),

    restart: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "process.restart",
    }),

    getRestartHistory: createQueryProcedure<{ id: string; limit?: number }, any[], any[]>({
      scope: "process",
      method: "process.getRestartHistory",
      mapResult: (result) => result ?? [],
    }),

    stats: createQueryProcedure<void, any, any>({
      scope: "process",
      method: "process.stats",
      mapInput: () => ({}),
    }),

    resetCircuitBreaker: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "process.resetCircuitBreaker",
    }),
  },

  monitoring: {
    getMetrics: createQueryProcedure<void, any[], any[]>({
      scope: "monitoring",
      method: "monitoring.getMetrics",
      mapInput: () => ({}),
      mapResult: (result) => result ?? [],
    }),

    getSnapshot: createQueryProcedure<void, any, any>({
      scope: "monitoring",
      method: "monitoring.getSnapshot",
      mapInput: () => ({}),
    }),

    getMetricsByNames: createQueryProcedure<{ names: string[] }, any[], any[]>({
      scope: "monitoring",
      method: "monitoring.getMetricsByNames",
      mapResult: (result) => result ?? [],
    }),

    getPrometheusMetrics: createQueryProcedure<void, string, string>({
      scope: "monitoring",
      method: "monitoring.getPrometheusMetrics",
      mapInput: () => ({}),
    }),

    getAlertRules: createQueryProcedure<void, any[], any[]>({
      scope: "monitoring",
      method: "monitoring.getAlertRules",
      mapInput: () => ({}),
      mapResult: (result) => result ?? [],
    }),

    getAlertRule: createQueryProcedure<{ id: string }, any, any>({
      scope: "monitoring",
      method: "monitoring.getAlertRule",
      mapResult: (result) => result,
    }),

    getActiveAlerts: createQueryProcedure<void, { alerts: any[] }, any[]>({
      scope: "monitoring",
      method: "monitoring.getActiveAlerts",
      mapInput: () => ({}),
      mapResult: (result) => result?.alerts ?? [],
    }),

    getAlertsByRule: createQueryProcedure<{ ruleId: string }, any[], any[]>({
      scope: "monitoring",
      method: "monitoring.getAlertsByRule",
      mapResult: (result) => result ?? [],
    }),

    getAlertHistory: createQueryProcedure<{ limit?: number }, any[], any[]>({
      scope: "monitoring",
      method: "monitoring.getAlertHistory",
      mapResult: (result) => result ?? [],
    }),
  },

  healing: {
    getEvents: createQueryProcedure<{ loopId: string; limit?: number }, { events: any[] }, any[]>({
      scope: "healing",
      method: "healing.getEvents",
      mapResult: (result) => result?.events ?? [],
    }),

    getPolicy: createQueryProcedure<void, { policy: any }, any>({
      scope: "healing",
      method: "healing.getPolicy",
      mapInput: () => ({}),
      mapResult: (result) => result?.policy,
    }),

    updatePolicy: createMutationProcedure<{ policy: any }, { success: boolean }, { success: boolean }>({
      method: "healing.updatePolicy",
    }),

    getKnownFixes: createQueryProcedure<void, { fixes: any[] }, any[]>({
      scope: "healing",
      method: "healing.getKnownFixes",
      mapInput: () => ({}),
      mapResult: (result) => result?.fixes ?? [],
    }),

    addKnownFix: createMutationProcedure<{ name: string; pattern: string; action: string }, { success: boolean }, { success: boolean }>({
      method: "healing.addKnownFix",
    }),

    testFix: createMutationProcedure<{ fixId: string }, { success: boolean; output: string }, { success: boolean; output: string }>({
      method: "healing.testFix",
    }),

    triggerHealing: createMutationProcedure<{ loopId: string; action?: string }, { success: boolean }, { success: boolean }>({
      method: "healing.triggerHealing",
    }),

    getCircuitBreakerStatus: createQueryProcedure<{ loopId: string }, any, any>({
      scope: "healing",
      method: "healing.getCircuitBreakerStatus",
      mapResult: (result) => result,
    }),

    resetCircuitBreaker: createMutationProcedure<{ loopId: string }, { success: boolean }, { success: boolean }>({
      method: "healing.resetCircuitBreaker",
    }),
  },

  skills: {
    list: createQueryProcedure<{ source?: string }, { skills: any[] }, any[]>({
      scope: "skills",
      method: "skills.list",
      mapResult: (result) => result?.skills ?? [],
    }),

    get: createQueryProcedure<{ name: string }, { skill: any }, any>({
      scope: "skills",
      method: "skills.get",
      mapResult: (result) => result?.skill,
    }),

    getContent: createQueryProcedure<{ name: string }, { content: string }, string>({
      scope: "skills",
      method: "skills.getContent",
      mapResult: (result) => result?.content ?? "",
    }),

    getCategories: createQueryProcedure<void, { categories: string[] }, string[]>({
      scope: "skills",
      method: "skills.getCategories",
      mapInput: () => ({}),
      mapResult: (result) => result?.categories ?? [],
    }),
  },

  // Checkpoint procedures (stub - not fully implemented)
  checkpoint: {
    list: createQueryProcedure<{ loopId?: string }, { checkpoints: any[] }, any[]>({
      scope: "checkpoint",
      method: "checkpoint.list",
      mapInput: (input) => input ?? {},
      mapResult: (result) => result?.checkpoints ?? [],
    }),

    stats: createQueryProcedure<{ cwd?: string }, any, any>({
      scope: "checkpoint",
      method: "checkpoint.stats",
      mapInput: (input) => input ?? {},
    }),

    restore: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "checkpoint.restore",
    }),

    delete: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "checkpoint.delete",
    }),
  },

  // Teams procedures (P4.5-1: Agent Teams Architecture)
  teams: {
    list: createQueryProcedure<{ status?: "idle" | "running" | "paused" | "completed" | "failed" } | undefined, { teams: any[] }, any[]>({
      scope: "teams",
      method: "teams.list",
      mapInput: (input) => input ?? {},
      mapResult: (result) => result?.teams ?? [],
    }),

    get: createQueryProcedure<{ id: string }, { team: any }, any>({
      scope: "teams",
      method: "teams.get",
      mapResult: (result) => result?.team,
    }),

    create: createMutationProcedure<{
      name: string;
      description?: string;
      prompt: string;
      coordinatorHatId: string;
      members: Array<{
        name: string;
        description: string;
        hatId: string;
      }>;
      contextSharing?: "full" | "selective" | "hierarchical";
      taskDistribution?: "parallel" | "pipeline" | "expert" | "voting";
    }, { team: any }, any>({
      method: "teams.create",
      mapResult: (result) => result?.team,
    }),

    update: createMutationProcedure<{
      id: string;
      name?: string;
      description?: string;
      taskDistribution?: "parallel" | "pipeline" | "expert" | "voting";
      contextSharing?: "full" | "selective" | "hierarchical";
    }, { team: any }, any>({
      method: "teams.update",
      mapResult: (result) => result?.team,
    }),

    start: createMutationProcedure<{ id: string }, { team: any }, any>({
      method: "teams.start",
      mapResult: (result) => result?.team,
    }),

    pause: createMutationProcedure<{ id: string }, { team: any }, any>({
      method: "teams.pause",
      mapResult: (result) => result?.team,
    }),

    stop: createMutationProcedure<{ id: string; reason?: string }, { team: any }, any>({
      method: "teams.stop",
      mapResult: (result) => result?.team,
    }),

    delete: createMutationProcedure<{ id: string }, { success: boolean }, { success: boolean }>({
      method: "teams.delete",
    }),

    updateAgentStatus: createMutationProcedure<{
      teamId: string;
      agentId: string;
      status: "idle" | "running" | "waiting" | "completed" | "failed";
    }, { success: boolean }, { success: boolean }>({
      method: "teams.updateAgentStatus",
    }),

    getStats: createQueryProcedure<void, any, any>({
      scope: "teams",
      method: "teams.stats",
      mapInput: () => ({}),
    }),

    suggestTask: createQueryProcedure<{
      teamId: string;
      agentId: string;
    }, { taskId: string | null; task?: any; reason?: string }, {
      taskId: string | null;
      task?: any;
      reason?: string;
    }>({
      scope: "teams",
      method: "teams.suggestTask",
    }),
  },
};

export function createTRPCClient() {
  return {
    kind: "rpc-v1-client",
  };
}
