import { describe, expect, it } from 'vitest';
import { COMPOSED_TEMPLATES, DIFFICULTIES, createRng, generateRun } from '../src';
import { MAX_LINES, MAX_OUTPUT, SIZE, compose, renderProgram, simulate } from '../src/compose/compose';
import { SECTIONS } from '../src/compose/sections';

const SEEDS = 500;

describe.each(DIFFICULTIES.map((d, level) => [d, level] as const))('composed programs (%s)', (_d, level) => {
  const programs = Array.from({ length: SEEDS }, (_, i) => compose(createRng(`compose-${level}-${i}`), level));

  it('are almost all different', () => {
    const unique = new Set(programs.map((p) => renderProgram(p).join('\n')));
    expect(unique.size).toBeGreaterThan(SEEDS * 0.9);
  });

  it('stay within the size limits', () => {
    const [lo, hi] = SIZE[level];
    for (const p of programs) {
      expect(p.length - 1).toBeGreaterThanOrEqual(lo);
      expect(p.length - 1).toBeLessThanOrEqual(hi);
      expect(renderProgram(p).length).toBeLessThanOrEqual(MAX_LINES);
      const res = simulate(p);
      expect(res.ok && res.out.length > 0 && res.out.length <= MAX_OUTPUT).toBe(true);
      expect(p[p.length - 1].def.id).toBe('print');
    }
  });

  it('have no dead steps', () => {
    for (const p of programs) {
      const base = simulate(p);
      for (let i = 0; i < p.length - 1; i++) {
        const skipped = simulate(p, { skip: i });
        expect(skipped.ok && base.ok && skipped.out === base.out).toBe(false);
      }
    }
  });

  it('only use sections allowed at this level, and use all of them', () => {
    const seen = new Set(programs.flatMap((p) => p.map((s) => s.def.id)));
    for (const s of SECTIONS) expect(seen.has(s.id)).toBe(s.level <= level);
  });
});

describe('question modes', () => {
  const composedShare = (mode: 'classic' | 'mix' | 'composed') => {
    const qs = Array.from({ length: 60 }, (_, i) => generateRun(`mode-${i}`, 'medium', 5, undefined, mode)).flat();
    return qs.filter((q) => q.template.startsWith('composed-')).length / qs.length;
  };

  it('classic uses only hand-written templates, composed only composed ones', () => {
    expect(composedShare('classic')).toBe(0);
    expect(composedShare('composed')).toBe(1);
  });

  it('mix is about two thirds composed', () => {
    const share = composedShare('mix');
    expect(share).toBeGreaterThan(0.55);
    expect(share).toBeLessThan(0.78);
  });

  it('defaults to classic, so runs stored without a mode regenerate identically', () => {
    expect(generateRun('old', 'hard', 5)).toEqual(generateRun('old', 'hard', 5, undefined, 'classic'));
  });

  it('respects enabled question types', () => {
    const qs = generateRun('types', 'easy', 12, ['fixbug'], 'composed');
    expect(qs.every((q) => q.type === 'fixbug')).toBe(true);
  });

  it('is fast enough to generate on demand', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) for (const t of COMPOSED_TEMPLATES) t.generate(createRng(`speed-${i}`));
    const perQuestion = (performance.now() - start) / (100 * COMPOSED_TEMPLATES.length);
    expect(perQuestion).toBeLessThan(20);
  });
});
