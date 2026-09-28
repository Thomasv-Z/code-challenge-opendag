import { create } from 'zustand';
import type { Difficulty, Loc, RunResult } from '@cc/shared';
import { api, type StartedRun } from '../lib/api';

export type Phase = 'start' | 'run' | 'finish';

interface GameState {
  phase: Phase;
  name: string;
  run: StartedRun | null;
  index: number;
  /** Local clock for display only; the server decides the real time. */
  startedAt: number;
  penaltyMs: number;
  /** Hints revealed for the current question. */
  hints: Loc[];
  /** The player's scratch notes, per question index. Kept for the run only. */
  notes: Record<number, string>;
  result: RunResult | null;
  setName(name: string): void;
  start(difficulty: Difficulty): Promise<void>;
  /** Checks an answer; on success call `advance` (after any feedback animation). */
  answer(text: string): Promise<{ correct: boolean; result?: RunResult }>;
  advance(result?: RunResult): void;
  hint(): Promise<Loc | null>;
  setNote(index: number, text: string): void;
  reset(keepName?: boolean): void;
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'start',
  name: '',
  run: null,
  index: 0,
  startedAt: 0,
  penaltyMs: 0,
  hints: [],
  notes: {},
  result: null,

  setName: (name) => set({ name }),

  async start(difficulty) {
    const run = await api.startRun(get().name.trim(), difficulty);
    set({ phase: 'run', run, index: 0, startedAt: Date.now(), penaltyMs: 0, hints: [], notes: {}, result: null });
  },

  async answer(text) {
    const { run, index } = get();
    if (!run) return { correct: false };
    const res = await api.answer(run.runId, index, text);
    if (!res.correct) set((s) => ({ penaltyMs: s.penaltyMs + res.penaltyMs }));
    return res;
  },

  advance(result) {
    if (result) set({ phase: 'finish', result });
    else set((s) => ({ index: s.index + 1, hints: [] }));
  },

  async hint() {
    const { run, index, hints } = get();
    if (!run || hints.length >= run.questions[index].hintCount) return null;
    const res = await api.hint(run.runId, index);
    set((s) => ({ hints: [...s.hints, res.hint], penaltyMs: s.penaltyMs + res.penaltyMs }));
    return res.hint;
  },

  setNote: (index, text) => set((s) => ({ notes: { ...s.notes, [index]: text } })),

  reset(keepName = false) {
    set((s) => ({ phase: 'start', run: null, index: 0, hints: [], notes: {}, result: null, penaltyMs: 0, name: keepName ? s.name : '' }));
  },
}));
