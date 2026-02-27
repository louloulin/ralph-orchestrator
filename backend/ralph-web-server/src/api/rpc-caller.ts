/**
 * RPC Caller Factory
 *
 * Creates a tRPC caller that can be used to invoke procedures programmatically.
 * This is used by the custom RPC handler to bridge RPC calls to tRPC procedures.
 */

import { Context, appRouter } from "./trpc";

/**
 * Get a tRPC caller from the context
 */
export function getCaller(ctx: Context) {
  return appRouter.createCaller(ctx);
}
