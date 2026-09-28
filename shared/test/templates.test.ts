import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLASSIC_TEMPLATES, DIFFICULTIES, TEMPLATES, buildQuestion, checkAnswer, generateRun, normalizeAnswer, toPublic,
  type Question,
} from '../src';

const SEEDS = 300;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `seed-${i}`);

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
  const questions = seeds(SEEDS).map((s) => buildQuestion(template, s));

  it('produces well-formed questions', () => {
    for (const q of questions) {
      expect(q.code.trim()).not.toBe('');
      expect(q.answer.trim()).not.toBe('');
      expect(q.prompt.nl && q.prompt.en).toBeTruthy();
      expect(q.hints).toHaveLength(3);
      for (const h of q.hints) expect(h.nl && h.en).toBeTruthy();
      expect(checkAnswer(q, q.answer)).toBe(true);
      expect(q.code).not.toMatch(/undefined|NaN/);
      if (q.type === 'fillblank') {
        expect(q.code).toContain('___');
        expect(q.verify.code).not.toContain('___');
      }
      if (q.type === 'fixbug') expect(q.highlightLine).toBeGreaterThan(0);
    }
  });

  it('has unique choices containing the answer', () => {
    for (const q of questions) {
      if (!q.choices) continue;
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.choices).toContain(q.answer);
      const normalized = q.choices.map(normalizeAnswer);
      expect(new Set(normalized).size).toBe(normalized.length);
    }
  });

  it('shows the answer as the output for predict questions', () => {
    for (const q of questions) {
      if (q.type === 'predict') expect(normalizeAnswer(q.verify.output)).toBe(normalizeAnswer(q.answer));
    }
  });

  it('actually varies between seeds', () => {
    expect(new Set(questions.map((q) => q.code + q.prompt.en)).size).toBeGreaterThan(10);
  });
});

describe('generateRun', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = generateRun('abc', 'medium', 5);
    expect(generateRun('abc', 'medium', 5)).toEqual(a);
    expect(generateRun('xyz', 'medium', 5).map((q) => q.code)).not.toEqual(a.map((q) => q.code));
  });

  it('does not repeat templates until the pool is exhausted', () => {
    for (const d of DIFFICULTIES) {
      const pool = CLASSIC_TEMPLATES.filter((t) => t.difficulty === d).length;
      const run = generateRun('r', d, pool);
      expect(new Set(run.map((q) => q.template)).size).toBe(pool);
      expect(generateRun('r', d, pool + 3)).toHaveLength(pool + 3);
    }
  });

  it('respects enabled question types and falls back when none match', () => {
    expect(generateRun('t', 'easy', 6, ['predict']).every((q) => q.type === 'predict')).toBe(true);
    expect(generateRun('t', 'easy', 3, [])).toHaveLength(3);
  });

  it('never leaks the answer to the client', () => {
    const pub = generateRun('p', 'hard', 5).map(toPublic);
    for (const q of pub) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('hints');
      expect(q).not.toHaveProperty('verify');
    }
  });
});

describe('normalizeAnswer', () => {
  it('ignores spacing, quotes and line breaks', () => {
    expect(normalizeAnswer('[1,2,  3]')).toBe(normalizeAnswer('[1, 2, 3]'));
    expect(normalizeAnswer('1\n2\n3')).toBe(normalizeAnswer('1 2 3'));
    expect(normalizeAnswer('"hi"')).toBe(normalizeAnswer("'hi'"));
    expect(normalizeAnswer('  Gold ')).toBe('Gold');
    expect(normalizeAnswer('True')).not.toBe(normalizeAnswer('true'));
  });
});

// Runs every generated program through real Python to prove the JS-computed answers are right,
// and that wrong multiple-choice fixes really are wrong.
const python = ['python', 'python3', 'py'].find((cmd) => spawnSync(cmd, ['--version']).status === 0);

describe.skipIf(!python)('python cross-check', () => {
  it('matches CPython output for every template', () => {
    type Case = { label: string; code: string; expected: string; mustMatch: boolean };
    const cases: Case[] = [];
    const replaceLine = (q: Question, line: string) => {
      const ls = q.code.split('\n');
      const indent = ls[q.highlightLine! - 1].match(/^\s*/)![0];
      ls[q.highlightLine! - 1] = indent + line;
      return ls.join('\n');
    };
    for (const t of TEMPLATES) {
      // Composed questions have far more shapes, so they get more samples.
      for (const s of seeds(t.id.startsWith('composed-') ? 300 : 200)) {
        const q = buildQuestion(t, s);
        const label = `${t.id} (${s})`;
        cases.push({ label, code: q.verify.code, expected: q.verify.output, mustMatch: true });
        for (const c of q.choices ?? []) {
          if (c === q.answer) continue;
          if (q.type === 'fillblank') cases.push({ label: `${label} wrong "${c}"`, code: q.code.replace('___', c), expected: q.verify.output, mustMatch: false });
          if (q.type === 'fixbug') cases.push({ label: `${label} wrong "${c}"`, code: replaceLine(q, c), expected: q.verify.output, mustMatch: false });
        }
        if (q.type === 'fixbug') cases.push({ label: `${label} original`, code: q.code, expected: q.verify.output, mustMatch: false });
      }
    }

    const dir = mkdtempSync(join(tmpdir(), 'cc-'));
    const input = join(dir, 'cases.json');
    const script = join(dir, 'run.py');
    writeFileSync(input, JSON.stringify(cases.map((c) => c.code)));
    writeFileSync(script, [
      'import io, json, sys, contextlib',
      'out = []',
      'for code in json.load(open(sys.argv[1], encoding="utf-8")):',
      '    buf = io.StringIO()',
      '    try:',
      '        with contextlib.redirect_stdout(buf):',
      '            exec(compile(code, "<q>", "exec"), {})',
      '        out.append(buf.getvalue())',
      '    except BaseException:',
      '        out.append(None)',
      'print(json.dumps(out))',
    ].join('\n'));
    const results: (string | null)[] = JSON.parse(execFileSync(python!, [script, input], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }));

    const clean = (s: string) => s.split('\n').map((l) => l.trimEnd()).join('\n').trimEnd();
    const failures: string[] = [];
    cases.forEach((c, i) => {
      const actual = results[i];
      const matches = actual !== null && clean(actual) === clean(c.expected);
      if (matches !== c.mustMatch) {
        failures.push(`${c.label}: expected ${c.mustMatch ? '' : 'NOT '}${JSON.stringify(c.expected)}, got ${JSON.stringify(actual)}\n${c.code}`);
      }
    });
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
