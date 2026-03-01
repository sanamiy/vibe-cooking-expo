/**
 * Skill Level Multiplier
 *
 * Adjusts task duration based on cook skill level
 */

import { SkillLevel, SKILL_MULTIPLIERS } from "./types";

/**
 * Get skill multiplier for a specific cook
 */
export function getSkillMultiplier(
  cookSkills: SkillLevel[] | undefined,
  cookIndex: number
): number {
  if (!cookSkills || cookIndex < 0 || cookIndex >= cookSkills.length) {
    return 1.0;
  }
  return SKILL_MULTIPLIERS[cookSkills[cookIndex]] ?? 1.0;
}

/**
 * Apply skill multiplier to duration (minimum 1 minute)
 */
export function applySkillToDuration(duration: number, multiplier: number): number {
  return Math.max(1, Math.round(duration * multiplier));
}
