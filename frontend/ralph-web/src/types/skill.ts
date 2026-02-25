/**
 * Skill Types
 *
 * Type definitions for the Skills system (P4.5-2) frontend.
 * Matches the backend skill types.
 */

import { z } from "zod";

/**
 * Skill source
 */
export const SkillSourceSchema = z.enum(["built_in", "user_defined", "marketplace"]);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

/**
 * Skill entry for display
 */
export const SkillEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  source: SkillSourceSchema,
  enabled: z.boolean(),
  tags: z.array(z.string()),
  author: z.string().optional(),
  version: z.string().optional(),
});
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

/**
 * Skill detail
 */
export const SkillDetailSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
  source: SkillSourceSchema,
  enabled: z.boolean(),
  tags: z.array(z.string()),
  author: z.string().optional(),
  version: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SkillDetail = z.infer<typeof SkillDetailSchema>;

/**
 * Skill category
 */
export const SkillCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  skillCount: z.number(),
});
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

/**
 * Skill source labels
 */
export const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  built_in: "Built-in",
  user_defined: "User Defined",
  marketplace: "Marketplace",
};

/**
 * Skill source colors
 */
export const SKILL_SOURCE_COLORS: Record<SkillSource, string> = {
  built_in: "bg-blue-500/20 text-blue-400",
  user_defined: "bg-purple-500/20 text-purple-400",
  marketplace: "bg-green-500/20 text-green-400",
};
