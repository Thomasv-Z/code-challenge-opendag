export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'predict' | 'fillblank' | 'fixbug';
export type Lang = 'nl' | 'en';
export type Loc = { nl: string; en: string };

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
export const QUESTION_TYPES: QuestionType[] = ['predict', 'fillblank', 'fixbug'];

export interface Question {
  id: string;
  template: string;
  type: QuestionType;
  difficulty: Difficulty;
  /** Python source shown to the player. Fill-in-the-blank questions contain `___`. */
  code: string;
  prompt: Loc;
  /** 1-based line to highlight (the buggy line for fix-the-bug questions). */
  highlightLine?: number;
  /** Multiple choice options. When absent the player types the answer. */
  choices?: string[];
  answer: string;
  /** Additional accepted typed answers. */
  accept?: string[];
  hints: Loc[];
  /** A complete, correct program and its exact stdout. Only used by tests. */
  verify: { code: string; output: string };
}

/** What the client receives: everything except the solution. */
export type PublicQuestion = Pick<
  Question,
  'id' | 'type' | 'difficulty' | 'code' | 'prompt' | 'highlightLine' | 'choices'
> & { hintCount: number };

/** The part of a question a template generates; the engine fills in the rest. */
export type GeneratedQuestion = Omit<Question, 'id' | 'template' | 'type' | 'difficulty'>;

export interface Template {
  id: string;
  difficulty: Difficulty;
  type: QuestionType;
  generate(rng: import('./rng').Rng): GeneratedQuestion;
}

export interface Settings {
  language: Lang;
  theme: 'dark' | 'light';
  questionsPerRun: Record<Difficulty, number>;
  hintPenaltySec: number;
  wrongPenaltySec: number;
  rotationSec: number;
  /** Show the "play along" QR code on the leaderboard display. */
  showQr: boolean;
  /** Give players a per-question notes box during a run. */
  showNotes: boolean;
  idleResetSec: number;
  enabledTypes: Record<Difficulty, QuestionType[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'nl',
  theme: 'dark',
  questionsPerRun: { easy: 5, medium: 5, hard: 5 },
  hintPenaltySec: 15,
  wrongPenaltySec: 5,
  rotationSec: 15,
  showQr: true,
  showNotes: true,
  idleResetSec: 30,
  enabledTypes: {
    easy: [...QUESTION_TYPES],
    medium: [...QUESTION_TYPES],
    hard: [...QUESTION_TYPES],
  },
};

export interface LeaderboardEntry {
  id: string;
  name: string;
  totalMs: number;
  hints: number;
  wrong: number;
  finishedAt: number;
}

export interface RunResult {
  runId: string;
  difficulty: Difficulty;
  rawMs: number;
  penaltyMs: number;
  totalMs: number;
  hints: number;
  wrong: number;
  rank: number;
}

export type ServerEvent =
  | { type: 'score:new'; difficulty: Difficulty; runId: string }
  | { type: 'settings:updated'; settings: Settings }
  | { type: 'leaderboard:reset' };
