import { createRng } from './rng';
import type { Difficulty, PublicQuestion, Question, QuestionMode, QuestionType, Template } from './types';
import { easyTemplates } from './templates/easy';
import { mediumTemplates } from './templates/medium';
import { hardTemplates } from './templates/hard';
import { composedTemplates } from './templates/composed';

export const CLASSIC_TEMPLATES: Template[] = [...easyTemplates, ...mediumTemplates, ...hardTemplates];
export const COMPOSED_TEMPLATES: Template[] = composedTemplates;
export const TEMPLATES: Template[] = [...CLASSIC_TEMPLATES, ...COMPOSED_TEMPLATES];

/** Share of composed questions in 'mix' mode. */
export const MIX_COMPOSED_SHARE = 2 / 3;

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
  mode: QuestionMode = 'classic',
): Question[] {
  const rng = createRng(seed);
  const poolOf = (list: Template[]) => {
    const all = list.filter((t) => t.difficulty === difficulty);
    const enabled = types?.length ? all.filter((t) => types.includes(t.type)) : all;
    return enabled.length ? enabled : all;
  };

  // Draw classic templates without repeats; reshuffle only when every template has been used.
  const classic: Template[] = [];
  while (classic.length < count) classic.push(...rng.shuffle(poolOf(CLASSIC_TEMPLATES)));
  if (mode === 'classic') return classic.slice(0, count).map((t, i) => buildQuestion(t, seed, i));

  const composed = poolOf(COMPOSED_TEMPLATES);
  let next = 0;
  return Array.from({ length: count }, (_, i) => {
    const useComposed = mode === 'composed' || rng.next() < MIX_COMPOSED_SHARE;
    return buildQuestion(useComposed ? rng.pick(composed) : classic[next++], seed, i);
  });
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
