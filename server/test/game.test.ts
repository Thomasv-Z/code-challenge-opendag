import { beforeEach, describe, expect, it } from 'vitest';
import { generateRun } from '@cc/shared';
import { openDb, type DB } from '../src/db';
import { createSettingsStore } from '../src/settings';
import { createGame, type Game } from '../src/game';

let db: DB;
let game: Game;
let clock = 0;

/** Reads the seed straight from the DB so the test can know the real answers. */
const answersFor = (runId: string) => {
  const row = db.prepare('SELECT seed, difficulty, config FROM runs WHERE id = ?').get(runId) as any;
  const cfg = JSON.parse(row.config);
  return generateRun(row.seed, row.difficulty, cfg.count, cfg.types).map((q) => q.answer);
};

beforeEach(() => {
  db = openDb(':memory:');
  const settings = createSettingsStore(db);
  settings.update({ questionsPerRun: { easy: 3, medium: 3, hard: 3 }, hintPenaltySec: 10, wrongPenaltySec: 5 });
  clock = 1_000_000;
  game = createGame(db, settings, () => clock);
});

describe('game', () => {
  it('scores a run from server time plus penalties', () => {
    const run = game.startRun('Ada', 'easy');
    expect(run.questions).toHaveLength(3);
    expect(run.questions[0]).not.toHaveProperty('answer');
    const answers = answersFor(run.runId);

    clock += 5_000;
    expect(game.answer(run.runId, 0, 'definitely wrong').correct).toBe(false);
    expect(game.hint(run.runId, 0).used).toBe(1);
    expect(game.answer(run.runId, 0, answers[0]).correct).toBe(true);
    clock += 10_000;
    expect(game.answer(run.runId, 1, answers[1]).correct).toBe(true);
    const out = game.answer(run.runId, 2, answers[2]);

    expect(out.result).toMatchObject({ rawMs: 15_000, penaltyMs: 15_000, totalMs: 30_000, hints: 1, wrong: 1, rank: 1 });
    expect(game.leaderboard('easy')).toHaveLength(1);
  });

  it('rejects out-of-order answers, finished runs and invalid names', () => {
    const run = game.startRun('Bob', 'medium');
    expect(() => game.answer(run.runId, 1, 'x')).toThrow('wrong_question');
    const answers = answersFor(run.runId);
    answers.forEach((a, i) => game.answer(run.runId, i, a));
    expect(() => game.answer(run.runId, 2, answers[2])).toThrow('run_finished');
    expect(() => game.startRun('', 'easy')).toThrow('invalid_name');
    expect(() => game.startRun('x'.repeat(21), 'easy')).toThrow('invalid_name');
    expect(() => game.startRun('Ann', 'expert')).toThrow('invalid_difficulty');
    expect(() => game.startRun('fuck', 'easy')).toThrow('name_not_allowed');
  });

  it('limits hints to three per question', () => {
    const run = game.startRun('Cy', 'hard');
    for (let i = 0; i < 3; i++) game.hint(run.runId, 0);
    expect(() => game.hint(run.runId, 0)).toThrow('no_more_hints');
  });

  it('keeps only the best time per name on the leaderboard', () => {
    const play = (name: string, ms: number) => {
      const run = game.startRun(name, 'easy');
      const answers = answersFor(run.runId);
      clock += ms;
      answers.forEach((a, i) => game.answer(run.runId, i, a));
    };
    play('Dana', 20_000);
    play('dana', 8_000);
    play('Eve', 12_000);
    const board = game.leaderboard('easy');
    expect(board.map((e) => [e.name.toLowerCase(), e.totalMs])).toEqual([['dana', 8_000], ['eve', 12_000]]);
  });

  it('survives a cache miss by regenerating questions from the seed', () => {
    const settings = createSettingsStore(db);
    const run = game.startRun('Fay', 'easy');
    const fresh = createGame(db, settings, () => clock); // e.g. after a server restart
    expect(fresh.answer(run.runId, 0, answersFor(run.runId)[0]).correct).toBe(true);
  });
});
