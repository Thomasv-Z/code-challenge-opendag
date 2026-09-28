import { randomUUID } from 'node:crypto';
import {
  DIFFICULTIES, checkAnswer, generateRun, isNameAllowed, toPublic,
  type Difficulty, type LeaderboardEntry, type Loc, type PublicQuestion, type Question,
  type QuestionType, type RunResult,
} from '@cc/shared';
import type { DB } from './db';
import type { SettingsStore } from './settings';

export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

interface RunConfig {
  count: number;
  types: QuestionType[];
  hintPenaltyMs: number;
  wrongPenaltyMs: number;
}

interface RunRow {
  id: string;
  name: string;
  difficulty: Difficulty;
  seed: string;
  config: string;
  started_at: number;
  finished_at: number | null;
  current: number;
  hints_used: string;
  wrong: number;
}

export interface StartedRun {
  runId: string;
  difficulty: Difficulty;
  questions: PublicQuestion[];
  hintPenaltySec: number;
  wrongPenaltySec: number;
}

export interface AnswerResponse {
  correct: boolean;
  penaltyMs: number;
  result?: RunResult;
}

export interface HintResponse {
  hint: Loc;
  used: number;
  remaining: number;
  penaltyMs: number;
}

export const MAX_NAME = 20;

/**
 * All game rules live here. The client only ever sees questions without answers,
 * and the final time is computed from server timestamps plus penalties.
 */
export function createGame(db: DB, settings: SettingsStore, now: () => number = Date.now) {
  // Questions are regenerated from the seed, so this cache is only an optimisation.
  const cache = new Map<string, Question[]>();

  const q = {
    insert: db.prepare(
      'INSERT INTO runs (id, name, difficulty, seed, config, started_at) VALUES (@id, @name, @difficulty, @seed, @config, @started_at)',
    ),
    get: db.prepare<[string], RunRow>('SELECT * FROM runs WHERE id = ?'),
    progress: db.prepare('UPDATE runs SET current = ?, wrong = ?, hints_used = ? WHERE id = ?'),
    finish: db.prepare('UPDATE runs SET current = ?, finished_at = ?, hints = ?, total_ms = ? WHERE id = ?'),
    // Names aren't unique: every finished run is its own leaderboard entry.
    board: db.prepare<[Difficulty, number], { id: string; name: string; total_ms: number; hints: number; wrong: number; finished_at: number }>(`
      SELECT id, name, total_ms, hints, wrong, finished_at
      FROM runs WHERE difficulty = ? AND finished_at IS NOT NULL
      ORDER BY total_ms ASC, finished_at ASC LIMIT ?`),
    rank: db.prepare<[Difficulty, number], { n: number }>(`
      SELECT COUNT(*) AS n FROM runs
      WHERE difficulty = ? AND finished_at IS NOT NULL AND total_ms < ?`),
    reset: db.prepare('DELETE FROM runs WHERE difficulty = ?'),
    resetAll: db.prepare('DELETE FROM runs'),
    all: db.prepare<[], { name: string; difficulty: string; total_ms: number; hints: number; wrong: number; started_at: number; finished_at: number }>(
      'SELECT name, difficulty, total_ms, hints, wrong, started_at, finished_at FROM runs WHERE finished_at IS NOT NULL ORDER BY difficulty, total_ms',
    ),
  };

  function load(runId: string) {
    const row = q.get.get(runId);
    if (!row) throw new HttpError(404, 'run_not_found');
    const config: RunConfig = JSON.parse(row.config);
    let questions = cache.get(runId);
    if (!questions) {
      questions = generateRun(row.seed, row.difficulty, config.count, config.types);
      cache.set(runId, questions);
    }
    return { row, config, questions, hintsUsed: JSON.parse(row.hints_used) as number[] };
  }

  function requireCurrent(row: RunRow, index: number) {
    if (row.finished_at !== null) throw new HttpError(409, 'run_finished');
    if (index !== row.current) throw new HttpError(409, 'wrong_question');
  }

  return {
    startRun(rawName: unknown, difficulty: unknown): StartedRun {
      const name = String(rawName ?? '').trim().replace(/\s+/g, ' ');
      if (!name || name.length > MAX_NAME) throw new HttpError(400, 'invalid_name');
      if (!isNameAllowed(name)) throw new HttpError(400, 'name_not_allowed');
      if (!DIFFICULTIES.includes(difficulty as Difficulty)) throw new HttpError(400, 'invalid_difficulty');
      const d = difficulty as Difficulty;

      const s = settings.get();
      const config: RunConfig = {
        count: s.questionsPerRun[d],
        types: s.enabledTypes[d],
        hintPenaltyMs: s.hintPenaltySec * 1000,
        wrongPenaltyMs: s.wrongPenaltySec * 1000,
      };
      const id = randomUUID();
      const seed = randomUUID();
      const questions = generateRun(seed, d, config.count, config.types);
      cache.set(id, questions);
      q.insert.run({ id, name, difficulty: d, seed, config: JSON.stringify(config), started_at: now() });
      return {
        runId: id,
        difficulty: d,
        questions: questions.map(toPublic),
        hintPenaltySec: s.hintPenaltySec,
        wrongPenaltySec: s.wrongPenaltySec,
      };
    },

    hint(runId: string, index: number): HintResponse {
      const { row, config, questions, hintsUsed } = load(runId);
      requireCurrent(row, index);
      const question = questions[index];
      const used = hintsUsed[index] ?? 0;
      if (used >= question.hints.length) throw new HttpError(409, 'no_more_hints');
      hintsUsed[index] = used + 1;
      q.progress.run(row.current, row.wrong, JSON.stringify(hintsUsed), runId);
      return {
        hint: question.hints[used],
        used: used + 1,
        remaining: question.hints.length - used - 1,
        penaltyMs: config.hintPenaltyMs,
      };
    },

    answer(runId: string, index: number, given: unknown): AnswerResponse {
      const { row, config, questions, hintsUsed } = load(runId);
      requireCurrent(row, index);
      if (!checkAnswer(questions[index], String(given ?? ''))) {
        q.progress.run(row.current, row.wrong + 1, row.hints_used, runId);
        return { correct: false, penaltyMs: config.wrongPenaltyMs };
      }

      const next = index + 1;
      if (next < questions.length) {
        q.progress.run(next, row.wrong, row.hints_used, runId);
        return { correct: true, penaltyMs: 0 };
      }

      const finishedAt = now();
      const hints = hintsUsed.reduce((a, b) => a + (b ?? 0), 0);
      const rawMs = finishedAt - row.started_at;
      const penaltyMs = hints * config.hintPenaltyMs + row.wrong * config.wrongPenaltyMs;
      const totalMs = rawMs + penaltyMs;
      q.finish.run(next, finishedAt, hints, totalMs, runId);
      cache.delete(runId);
      const rank = q.rank.get(row.difficulty, totalMs)!.n + 1;
      return {
        correct: true,
        penaltyMs: 0,
        result: { runId, difficulty: row.difficulty, rawMs, penaltyMs, totalMs, hints, wrong: row.wrong, rank },
      };
    },

    leaderboard(difficulty: Difficulty, limit = 10): LeaderboardEntry[] {
      return q.board.all(difficulty, limit).map((r) => ({
        id: r.id, name: r.name, totalMs: r.total_ms, hints: r.hints, wrong: r.wrong, finishedAt: r.finished_at,
      }));
    },

    reset(difficulty?: Difficulty) {
      if (difficulty) q.reset.run(difficulty);
      else q.resetAll.run();
      cache.clear();
    },

    exportCsv(): string {
      const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
      const rows = q.all.all().map((r) =>
        [r.name, r.difficulty, (r.total_ms / 1000).toFixed(2), r.hints, r.wrong, new Date(r.finished_at).toISOString()].map(esc).join(','),
      );
      return ['name,difficulty,seconds,hints,wrong,finished_at', ...rows].join('\n');
    },
  };
}

export type Game = ReturnType<typeof createGame>;
