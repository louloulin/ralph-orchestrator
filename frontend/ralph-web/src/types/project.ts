/**
 * Project Types
 *
 * Type definitions for the multi-project architecture frontend
 */

import { z } from "zod";

/**
 * Project type enum: local or worktree
 */
export const ProjectTypeSchema = z.enum(["local", "worktree"]);

export type ProjectType = z.infer<typeof ProjectTypeSchema>;

/**
 * Project data model
 */
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: ProjectTypeSchema.default("local"),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

/**
 * Input schema for creating a project
 */
export const CreateProjectInputSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  path: z.string().min(1, "Project path is required"),
  type: ProjectTypeSchema.default("local"),
  description: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

/**
 * Input schema for updating a project
 */
export const UpdateProjectInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  type: ProjectTypeSchema.optional(),
  description: z.string().nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

/**
 * Path validation result
 */
export const PathValidationSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
});

export type PathValidation = z.infer<typeof PathValidationSchema>;
