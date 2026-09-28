import { DIFFICULTIES, QUESTION_TYPES, type Template } from '../types';
import { composeQuestion } from '../compose/compose';

/** One template per level × type; each builds a fresh program from random sections. */
export const composedTemplates: Template[] = DIFFICULTIES.flatMap((difficulty) =>
  QUESTION_TYPES.map((type) => ({
    id: `composed-${difficulty}-${type}`,
    difficulty,
    type,
    generate: (rng) => composeQuestion(rng, difficulty, type),
  })),
);
