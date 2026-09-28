// Helpers for templates: Python value formatting, arithmetic that matches Python
// semantics, name pools, multiple-choice construction and standard prompts.
import type { Loc } from './types';
import type { Rng } from './rng';

export type PyValue = number | string | boolean | null | PyValue[] | { [key: string]: PyValue };

/** Python's repr() for the values templates use. Numbers are ints; use pyFloat for floats. */
export function pyRepr(v: PyValue): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `'${v}'`;
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  return `{${Object.entries(v)
    .map(([k, val]) => `'${k}': ${pyRepr(val)}`)
    .join(', ')}}`;
}

/** Python's str(), i.e. what print() shows. */
export function pyStr(v: PyValue): string {
  return typeof v === 'string' ? v : pyRepr(v);
}

/** repr of a Python float: 3 -> "3.0", 2.5 -> "2.5". */
export function pyFloat(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export const floorDiv = (a: number, b: number) => Math.floor(a / b);
export const pyMod = (a: number, b: number) => ((a % b) + b) % b;

export const VAR_NAMES = [
  'x', 'y', 'a', 'b', 'n', 'score', 'total', 'count', 'points', 'level',
  'speed', 'age', 'price', 'coins', 'lives', 'energy', 'value', 'steps',
];
export const WORDS = [
  'python', 'code', 'data', 'robot', 'pixel', 'laptop', 'matrix', 'kernel',
  'binary', 'server', 'cloud', 'debug', 'syntax', 'logic', 'script', 'router',
];
export const PEOPLE = ['Anna', 'Bram', 'Chloe', 'Daan', 'Emma', 'Finn', 'Lotte', 'Sem', 'Noor', 'Jesse'];
export const LIST_NAMES = ['nums', 'values', 'scores', 'data', 'items', 'numbers'];

/**
 * Builds a shuffled list of `n` unique choices containing `correct`.
 * Distractors are taken in order, so pass the most plausible mistakes first.
 */
export function makeChoices(rng: Rng, correct: string, distractors: string[], n = 4): string[] {
  const picked: string[] = [];
  for (const d of distractors) {
    if (picked.length >= n - 1) break;
    if (d !== correct && !picked.includes(d)) picked.push(d);
  }
  return rng.shuffle([correct, ...picked]);
}

/** Nearby integers as fallback distractors. */
export function numberNeighbors(n: number): string[] {
  return [n + 1, n - 1, n + 2, n - 2, n * 2, n + 10].map(String);
}

export const PROMPT_PREDICT: Loc = {
  nl: 'Wat print deze code?',
  en: 'What does this code print?',
};

export const promptFill = (output: string): Loc => ({
  nl: `Wat moet er op de lege plek (___) staan zodat de code \`${output}\` print?`,
  en: `What belongs in the blank (___) so the code prints \`${output}\`?`,
});

export const promptFix = (output: string, line: number): Loc => ({
  nl: `Deze code zou \`${output}\` moeten printen, maar regel ${line} bevat een fout. Welke regel lost het op?`,
  en: `This code should print \`${output}\`, but line ${line} has a bug. Which line fixes it?`,
});

/** Joins code lines; keeps templates readable. */
export const lines = (...ls: string[]) => ls.join('\n');
