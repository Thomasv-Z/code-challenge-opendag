import { DEFAULT_SETTINGS, DIFFICULTIES, QUESTION_TYPES, type Settings } from '@cc/shared';
import type { DB } from './db';

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Merges untrusted input onto defaults, dropping anything invalid. */
export function sanitizeSettings(input: any, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = input ?? {};
  const perDifficulty = <T>(pick: (d: (typeof DIFFICULTIES)[number]) => T) =>
    Object.fromEntries(DIFFICULTIES.map((d) => [d, pick(d)])) as Record<(typeof DIFFICULTIES)[number], T>;
  return {
    language: s.language === 'en' || s.language === 'nl' ? s.language : base.language,
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : base.theme,
    questionsPerRun: perDifficulty((d) => clamp(s.questionsPerRun?.[d], 1, 20, base.questionsPerRun[d])),
    hintPenaltySec: clamp(s.hintPenaltySec, 0, 300, base.hintPenaltySec),
    wrongPenaltySec: clamp(s.wrongPenaltySec, 0, 300, base.wrongPenaltySec),
    rotationSec: clamp(s.rotationSec, 5, 120, base.rotationSec),
    showQr: typeof s.showQr === 'boolean' ? s.showQr : base.showQr,
    showNotes: typeof s.showNotes === 'boolean' ? s.showNotes : base.showNotes,
    idleResetSec: clamp(s.idleResetSec, 10, 600, base.idleResetSec),
    enabledTypes: perDifficulty((d) => {
      const list = s.enabledTypes?.[d];
      if (!Array.isArray(list)) return base.enabledTypes[d];
      const valid = QUESTION_TYPES.filter((t) => list.includes(t));
      return valid.length ? valid : [...QUESTION_TYPES];
    }),
  };
}

export function createSettingsStore(db: DB) {
  const row = db.prepare<[], { value: string }>("SELECT value FROM settings WHERE key = 'settings'").get();
  let current = sanitizeSettings(row ? JSON.parse(row.value) : {});
  const save = db.prepare("INSERT INTO settings (key, value) VALUES ('settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  return {
    get: () => current,
    update(input: unknown) {
      current = sanitizeSettings(input, current);
      save.run(JSON.stringify(current));
      return current;
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
