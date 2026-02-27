/**
 * Custom RPC Handler
 *
 * Handles the custom RPC protocol at /rpc/v1 used by the frontend.
 * Maps RPC method calls to the appropriate tRPC procedures or direct service calls.
 */

import { FastifyInstance } from "fastify";
import { Context } from "./trpc";
import { TRPCError } from "@trpc/server";
import { getCaller } from "./rpc-caller";

interface RpcRequest {
  apiVersion: string;
  id: string;
  method: string;
  params: Record<string, unknown>;
  meta?: {
    idempotencyKey?: string;
    requestTs?: string;
  };
}

interface RpcResponse<TResult> {
  apiVersion: string;
  id: string;
  method?: string;
  result?: TResult;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
}

/**
 * Map frontend RPC method names to backend tRPC router names.
 * Some frontend methods use singular form while backend uses plural.
 */
const ROUTER_NAME_MAP: Record<string, string> = {
  loop: "loops",    // Frontend uses "loop.list", backend uses "loops"
  preset: "presets", // Frontend uses "preset.list", backend uses "presets"
};

/**
 * Register the custom RPC handler at /rpc/v1
 */
export async function registerRpcHandler(
  server: FastifyInstance,
  ctx: Context
): Promise<void> {
  server.post<{ Body: RpcRequest }>("/rpc/v1", async (request, reply) => {
    const rpcRequest = request.body;

    if (!rpcRequest.method) {
      return reply.status(400).send({
        apiVersion: "v1",
        id: rpcRequest.id ?? "unknown",
        error: {
          code: "INVALID_REQUEST",
          message: "Missing method in RPC request",
          retryable: false,
        },
      } as RpcResponse<never>);
    }

    try {
      const caller = getCaller(ctx);
      let [routerName, procedureName] = rpcRequest.method.split(".");

      if (!routerName || !procedureName) {
        return reply.status(400).send({
          apiVersion: "v1",
          id: rpcRequest.id,
          error: {
            code: "INVALID_METHOD",
            message: `Invalid method format: ${rpcRequest.method}. Expected format: router.procedure`,
            retryable: false,
          },
        } as RpcResponse<never>);
      }

      // Map frontend router name to backend router name if needed
      const actualRouterName = ROUTER_NAME_MAP[routerName] ?? routerName;

      // Map the RPC method to tRPC caller
      // @ts-expect-error - Dynamic access to caller
      const router = caller[actualRouterName];
      if (!router) {
        return reply.status(404).send({
          apiVersion: "v1",
          id: rpcRequest.id,
          error: {
            code: "NOT_FOUND",
            message: `Router not found: ${routerName}`,
            retryable: false,
          },
        } as RpcResponse<never>);
      }

      // @ts-expect-error - Dynamic access to procedure
      const procedure = router[procedureName];
      if (!procedure) {
        return reply.status(404).send({
          apiVersion: "v1",
          id: rpcRequest.id,
          error: {
            code: "NOT_FOUND",
            message: `Procedure not found: ${rpcRequest.method}`,
            retryable: false,
          },
        } as RpcResponse<never>);
      }

      // Execute the procedure
      const result = await procedure(rpcRequest.params ?? {});

      return {
        apiVersion: "v1",
        id: rpcRequest.id,
        method: rpcRequest.method,
        result,
      } as RpcResponse<typeof result>;
    } catch (error) {
      console.error(`RPC Error on ${rpcRequest.method}:`, error);

      if (error instanceof TRPCError) {
        return reply.status(error.code === "NOT_FOUND" ? 404 : 500).send({
          apiVersion: "v1",
          id: rpcRequest.id,
          error: {
            code: error.code,
            message: error.message,
            retryable: false,
            details: error.cause,
          },
        } as RpcResponse<never>);
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.status(500).send({
        apiVersion: "v1",
        id: rpcRequest.id,
        error: {
          code: "INTERNAL_ERROR",
          message: errorMessage,
          retryable: true,
        },
      } as RpcResponse<never>);
    }
  });
}
