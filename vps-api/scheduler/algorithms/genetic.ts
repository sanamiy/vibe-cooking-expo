/**
 * Genetic Algorithm Scheduling
 *
 * Uses evolutionary optimization to find better task orderings
 * Supports sync constraints for simultaneous completion
 */

import { SchedulerTask, KitchenConfig } from "../types";
import { greedySchedule } from "./greedy";

interface GeneticOptions {
  generations?: number;
  populationSize?: number;
  mutationRate?: number;
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sampleTwo<T>(array: T[]): [T, T] {
  const i = Math.floor(Math.random() * array.length);
  let j = Math.floor(Math.random() * (array.length - 1));
  if (j >= i) j++;
  return [array[i], array[j]];
}

/**
 * Genetic algorithm scheduling
 */
export function geneticSchedule(
  allTasks: SchedulerTask[],
  config: KitchenConfig,
  syncTolerance: number = 0,
  syncWeight: number = 0,
  options: GeneticOptions = {}
): SchedulerTask[] {
  const {
    generations = 50,
    populationSize = 20,
    mutationRate = 0.1,
  } = options;

  // Group tasks by recipe
  const tasksByRecipe = new Map<string, SchedulerTask[]>();
  for (const task of allTasks) {
    const list = tasksByRecipe.get(task.recipe_id) ?? [];
    list.push(task);
    tasksByRecipe.set(task.recipe_id, list);
  }

  for (const [, tasks] of tasksByRecipe) {
    tasks.sort((a, b) => a.step_index - b.step_index);
  }

  const recipeIds = Array.from(tasksByRecipe.keys());

  if (recipeIds.length <= 1) {
    // No need for genetic optimization with single recipe
    return greedySchedule(allTasks, config);
  }

  // Create individual (recipe priority order)
  const createIndividual = (): string[] => shuffleArray(recipeIds);

  // Evaluate fitness (lower is better)
  const evaluate = (individual: string[]): number => {
    // Order tasks by recipe priority
    const orderedTasks: SchedulerTask[] = [];
    for (const recipeId of individual) {
      const tasks = tasksByRecipe.get(recipeId) ?? [];
      orderedTasks.push(...tasks.map((t) => ({ ...t })));
    }

    const scheduled = greedySchedule(orderedTasks, config);
    if (scheduled.length === 0) return Infinity;

    const totalTime = Math.max(
      ...scheduled.map((t) => t.start_time + t.duration)
    );

    // Calculate recipe end times
    const recipeEndTimes = new Map<string, number>();
    for (const t of scheduled) {
      const end = t.start_time + t.duration;
      const current = recipeEndTimes.get(t.recipe_id) ?? 0;
      recipeEndTimes.set(t.recipe_id, Math.max(current, end));
    }

    // Calculate sync variance
    const endTimes = Array.from(recipeEndTimes.values());
    const syncVariance =
      endTimes.length > 1 ? Math.max(...endTimes) - Math.min(...endTimes) : 0;

    // Hard constraint: sync_tolerance
    if (syncTolerance > 0 && syncVariance > syncTolerance) {
      return totalTime + 1000; // Large penalty
    }

    // Soft constraint: sync_weight
    return totalTime + syncWeight * syncVariance;
  };

  // Crossover
  const crossover = (parent1: string[], parent2: string[]): string[] => {
    const point = 1 + Math.floor(Math.random() * (parent1.length - 1));
    const child = parent1.slice(0, point);
    for (const gene of parent2) {
      if (!child.includes(gene)) {
        child.push(gene);
      }
    }
    return child;
  };

  // Mutation
  const mutate = (individual: string[]): string[] => {
    if (individual.length < 2) return individual;
    const result = [...individual];
    const [i, j] = [
      Math.floor(Math.random() * result.length),
      Math.floor(Math.random() * result.length),
    ];
    [result[i], result[j]] = [result[j], result[i]];
    return result;
  };

  // Initialize population
  let population = Array.from({ length: populationSize }, createIndividual);

  // Evolution
  for (let gen = 0; gen < generations; gen++) {
    // Evaluate and sort
    const scored = population
      .map((ind) => ({ ind, score: evaluate(ind) }))
      .sort((a, b) => a.score - b.score);

    // Elite selection
    const elite = scored.slice(0, Math.floor(populationSize / 2)).map((s) => s.ind);

    // Generate next generation
    const newPopulation = [...elite];
    while (newPopulation.length < populationSize) {
      const [parent1, parent2] = sampleTwo(elite);
      let child = crossover(parent1, parent2);
      if (Math.random() < mutationRate) {
        child = mutate(child);
      }
      newPopulation.push(child);
    }

    population = newPopulation;
  }

  // Get best individual
  const best = population.reduce((a, b) =>
    evaluate(a) < evaluate(b) ? a : b
  );

  // Schedule with best order
  const orderedTasks: SchedulerTask[] = [];
  for (const recipeId of best) {
    const tasks = tasksByRecipe.get(recipeId) ?? [];
    orderedTasks.push(...tasks.map((t) => ({ ...t })));
  }

  return greedySchedule(orderedTasks, config);
}
