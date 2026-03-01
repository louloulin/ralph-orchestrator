/**
 * SpawnHelper
 *
 * Utility service for spawning CLI processes and parsing their output.
 * Used by tRPC endpoints to call ralph CLI commands.
 */

import { spawn } from "child_process";

/**
 * Result type for spawned commands
 */
export interface SpawnResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Spawn a CLI command and parse its JSON output
 *
 * @param command - The command to run (e.g., "ralph")
 * @param args - Command arguments
 * @param options - Spawn options
 * @returns Parsed JSON result
 */
export async function spawnAsync(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    timeout?: number;
  }
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options?.cwd || process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = options?.timeout || 30000; // 30 second default timeout

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        error: `Command timed out after ${timeout}ms`,
      });
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        resolve({
          success: false,
          error: stderr || `Command failed with code ${code}`,
        });
        return;
      }

      // Try to parse JSON output
      try {
        // Find JSON in output (some commands may have text before/after)
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          resolve({
            success: true,
            data,
          });
        } else {
          resolve({
            success: true,
            data: stdout.trim(),
          });
        }
      } catch (parseError) {
        // If JSON parsing fails, return the raw output
        resolve({
          success: true,
          data: stdout.trim(),
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}
