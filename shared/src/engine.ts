import { createRng } from './rng';
import type { Difficulty, PublicQuestion, Question, QuestionType, Template } from './types';
import { easyTemplates } from './templates/easy';
import { mediumTemplates } from './templates/medium';
import { hardTemplates } from './templates/hard';

export const TEMPLATES: Template[] = [...easyTemplates, ...mediumTemplates, ...hardTemplates];

export function buildQuestion(template: Template, seed: string, index = 0): Question {
  const q = template.generate(createRng(`${seed}:${index}`));
  return {
    ...q,
    id: `${template.id}#${index}`,
    template: template.id,
    type: template.type,
    difficulty: template.difficulty,
  };
}

/**
 * Deterministically generates a run: the same seed and options always give the same
 * questions, so the server can regenerate them instead of storing them.
 */
export function generateRun(
  seed: string,
  difficulty: Difficulty,
  count: number,
  types?: QuestionType[],
): Question[] {
  const rng = createRng(seed);
  const all = TEMPLATES.filter((t) => t.difficulty === difficulty);
  const enabled = types?.length ? all.filter((t) => types.includes(t.type)) : all;
  const pool = enabled.length ? enabled : all;

  // Draw templates without repeats; reshuffle only when every template has been used.
  const order: Template[] = [];
  while (order.length < count) order.push(...rng.shuffle(pool));
  return order.slice(0, count).map((t, i) => buildQuestion(t, seed, i));
}

export function toPublic(q: Question): PublicQuestion {
  return {
    id: q.id,
    type: q.type,
    difficulty: q.difficulty,
    code: q.code,
    prompt: q.prompt,
    highlightLine: q.highlightLine,
    choices: q.choices,
    hintCount: q.hints.length,
  };
}

/** Lenient comparison: quotes, whitespace and spacing around punctuation don't matter. */
export function normalizeAnswer(s: string): string {
  return s
    .replace(/[“”"]/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*([,[\](){}:])\s*/g, '$1');
}

export function checkAnswer(q: Question, given: string): boolean {
  const g = normalizeAnswer(given);
  return [q.answer, ...(q.accept ?? [])].some((a) => normalizeAnswer(a) === g);
}
