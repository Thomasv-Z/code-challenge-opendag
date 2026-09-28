import type { Difficulty, LeaderboardEntry, Loc, PublicQuestion, RunResult, Settings } from '@cc/shared';

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function request<T>(method: string, url: string, body?: unknown, pin?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(pin ? { 'x-admin-pin': pin } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? (res.status >= 500 ? 'network' : 'generic'));
  }
  return res.headers.get('content-type')?.includes('json') ? res.json() : (res.text() as unknown as T);
}

export interface StartedRun {
  runId: string;
  difficulty: Difficulty;
  questions: PublicQuestion[];
  hintPenaltySec: number;
  wrongPenaltySec: number;
}

export type Boards = Record<Difficulty, LeaderboardEntry[]>;

export const api = {
  settings: () => request<Settings>('GET', '/api/settings'),
  info: () => request<{ urls: string[] }>('GET', '/api/info'),
  leaderboard: (limit = 10) => request<Boards>('GET', `/api/leaderboard?limit=${limit}`),
  startRun: (name: string, difficulty: Difficulty) => request<StartedRun>('POST', '/api/runs', { name, difficulty }),
  hint: (runId: string, index: number) =>
    request<{ hint: Loc; used: number; remaining: number; penaltyMs: number }>('POST', `/api/runs/${runId}/hint`, { index }),
  answer: (runId: string, index: number, answer: string) =>
    request<{ correct: boolean; penaltyMs: number; result?: RunResult }>('POST', `/api/runs/${runId}/answer`, { index, answer }),
  admin: {
    login: (pin: string) => request<{ ok: true }>('POST', '/api/admin/login', undefined, pin),
    saveSettings: (pin: string, s: Settings) => request<Settings>('PUT', '/api/admin/settings', s, pin),
    reset: (pin: string, difficulty?: Difficulty) =>
      request('DELETE', `/api/admin/runs${difficulty ? `?difficulty=${difficulty}` : ''}`, undefined, pin),
    exportCsv: (pin: string) => request<string>('GET', '/api/admin/export.csv', undefined, pin),
  },
};
