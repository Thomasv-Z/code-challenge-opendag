// Composes random programs from sections and turns them into questions.
import type { Difficulty, GeneratedQuestion, Loc, QuestionType } from '../types';
import type { Rng } from '../rng';
import { PROMPT_PREDICT, makeChoices, numberNeighbors, promptFill, promptFix, pyRepr } from '../py';
import { GuardError, PyError, cloneState, kindOf, newState, type Kind, type State } from './state';
import { SECTIONS, printSection, type Ctx, type Param, type Params, type SectionDef } from './sections';

export interface Step {
  def: SectionDef;
  p: Params;
}
/** A composed program; the last step is always the print. */
export type Program = Step[];

interface Override {
  index: number;
  key: string;
  value: Param;
}

type Result = { ok: true; out: string; states: State[] } | { ok: false; error: 'py' | 'guard' };

const LEVEL: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
/** Number of sections (excluding the print) per level. */
export const SIZE: [number, number][] = [[2, 3], [3, 4], [4, 6]];
export const MAX_LINES = 12;
export const MAX_OUTPUT = 40;
const BLANK = '___';

const NAMES: Record<Kind | 'func', string[]> = {
  int: ['score', 'total', 'count', 'points', 'level', 'coins', 'speed', 'lives', 'energy', 'bonus', 'power', 'health', 'value'],
  str: ['word', 'text', 'name', 'code', 'tag', 'label'],
  list: ['nums', 'values', 'scores', 'data', 'items', 'marks'],
  func: ['boost', 'calc', 'mix', 'twist', 'tweak', 'bump'],
};

const paramsAt = (step: Step, i: number, o?: Override): Params =>
  o && o.index === i ? { ...step.p, [o.key]: o.value } : step.p;

export const renderProgram = (prog: Program, o?: Override): string[] =>
  prog.flatMap((step, i) => step.def.render(paramsAt(step, i, o)));

export function simulate(prog: Program, opts: { override?: Override; skip?: number } = {}): Result {
  const s = newState();
  const states: State[] = [];
  try {
    prog.forEach((step, i) => {
      if (i !== opts.skip) step.def.run(s, paramsAt(step, i, opts.override));
      states.push(cloneState(s));
    });
  } catch (e) {
    if (e instanceof PyError) return { ok: false, error: 'py' };
    if (e instanceof GuardError) return { ok: false, error: 'guard' };
    throw e;
  }
  return { ok: true, out: s.out.join('\n'), states };
}

function makeCtx(rng: Rng, level: number, state: State, recent: string[], used: Set<string>): Ctx {
  return {
    rng,
    level,
    state,
    pick(kind, exclude = []) {
      const names = [...state.vars.keys()].filter((n) => kindOf(state.vars.get(n)!) === kind && !exclude.includes(n));
      if (!names.length) return null;
      // Mostly continue with what was just changed, so sections build on each other.
      const latest = [...recent].reverse().find((n) => names.includes(n));
      return latest && rng.chance(0.7) ? latest : rng.pick(names);
    },
    fresh(kind) {
      const free = NAMES[kind].filter((n) => !used.has(n));
      if (!free.length) return null;
      const name = rng.pick(free);
      used.add(name);
      return name;
    },
  };
}

/**
 * Weighted random order without replacement. Sections introduced at the current level are
 * favoured (so hard questions use hard constructs); repeating the previous one is less likely.
 */
function weightedOrder(rng: Rng, defs: SectionDef[], level: number, previous?: string): SectionDef[] {
  const pool = defs.map((d) => ({ d, w: d.weight * (d.level === level && level > 0 ? 2 : 1) / (d.id === previous ? 3 : 1) }));
  const out: SectionDef[] = [];
  while (pool.length) {
    let r = rng.next() * pool.reduce((sum, x) => sum + x.w, 0);
    const i = Math.max(0, pool.findIndex((x) => (r -= x.w) < 0));
    out.push(pool.splice(i, 1)[0].d);
  }
  return out;
}

function tryCompose(rng: Rng, level: number): Program | null {
  const [lo, hi] = SIZE[level];
  const size = rng.int(lo, hi);
  const prog: Program = [];
  const recent: string[] = [];
  const used = new Set<string>();
  let state = newState();

  while (prog.length < size) {
    const setups = prog.filter((s) => s.def.setup).length;
    const isLast = prog.length === size - 1;
    const pool = SECTIONS.filter((d) => {
      if (d.level > level) return false;
      if (!prog.length) return !!d.setup;
      if (d.setup) return !isLast && setups < 2 && state.vars.size < 3;
      return true;
    });
    let placed = false;
    for (const def of weightedOrder(rng, pool, level, prog.at(-1)?.def.id)) {
      const p = def.create(makeCtx(rng, level, state, recent, used));
      if (!p) continue;
      const trial = cloneState(state);
      try {
        def.run(trial, p);
      } catch {
        continue;
      }
      state = trial;
      prog.push({ def, p });
      recent.push(...def.writes(p));
      placed = true;
      break;
    }
    if (!placed) return null;
  }

  const last = prog[prog.length - 1];
  const a = rng.pick(last.def.writes(last.p));
  const others = [...state.vars.keys()].filter((n) => n !== a);
  const b = level > 0 && others.length && rng.chance(0.35) ? rng.pick(others) : '';
  prog.push({ def: printSection, p: { a, b } });
  return prog;
}

function isGood(prog: Program): boolean {
  if (renderProgram(prog).length > MAX_LINES) return false;
  const res = simulate(prog);
  if (!res.ok || !res.out || res.out.length > MAX_OUTPUT) return false;
  // Every step must matter: skipping it changes the output (or breaks the program).
  // This rules out dead code and no-op steps like `max(x, 3)` when x is already larger.
  for (let i = 0; i < prog.length - 1; i++) {
    const skipped = simulate(prog, { skip: i });
    if (skipped.ok && skipped.out === res.out) return false;
  }
  return true;
}

export function compose(rng: Rng, level: number): Program {
  for (let attempt = 0; attempt < 200; attempt++) {
    const prog = tryCompose(rng, level);
    if (prog && isGood(prog)) return prog;
  }
  throw new Error('Could not compose a program');
}

// ---------------------------------------------------------------- questions

interface TweakPoint {
  index: number;
  key: string;
  value: Param;
  alts: Param[];
}

function tweakPoints(prog: Program): TweakPoint[] {
  return prog.flatMap((step, index) =>
    (step.def.tweaks?.(step.p) ?? []).map((t) => ({ index, key: t.key, value: step.p[t.key], alts: t.alts })),
  );
}

/** Alternatives for a tweak point that are valid Python but give a different result. */
function wrongAlts(prog: Program, tp: TweakPoint, out: string): Param[] {
  const seen = new Set([String(tp.value)]);
  return tp.alts.filter((alt) => {
    if (seen.has(String(alt))) return false;
    seen.add(String(alt));
    const r = simulate(prog, { override: { index: tp.index, key: tp.key, value: alt } });
    return r.ok ? r.out !== out : r.error === 'py';
  });
}

const firstLine = (prog: Program, index: number) =>
  prog.slice(0, index).reduce((n, s) => n + s.def.render(s.p).length, 0) + 1;

const describe = (state: State) =>
  [...state.vars].map(([k, v]) => `${k} = ${pyRepr(v)}`).join(', ') || '—';

function buildHints(rng: Rng, prog: Program, type: QuestionType, focus?: number): Loc[] {
  const res = simulate(prog) as Extract<Result, { ok: true }>;
  const transforms = prog.map((s, i) => i).filter((i) => !prog[i].def.setup && i < prog.length - 1);
  const lastT = transforms[transforms.length - 1];
  const hardest = transforms.filter((i) => prog[i].def.level === Math.max(...transforms.map((j) => prog[j].def.level)));
  const tipIndex = focus !== undefined && !prog[focus].def.setup ? focus : rng.pick(hardest);
  const before = lastT > 0 ? res.states[lastT - 1] : newState();
  const line = firstLine(prog, lastT);

  const first: Record<QuestionType, Loc> = {
    predict: { nl: 'Werk de code blok voor blok af en houd bij welke waarde elke variabele heeft.', en: 'Work through the code block by block and keep track of every variable.' },
    fillblank: { nl: 'Probeer elke optie in gedachten uit: welke geeft precies de gevraagde output?', en: 'Try each option in your head: which gives exactly the requested output?' },
    fixbug: { nl: 'De rest van de code klopt; alleen de gemarkeerde regel moet anders. Loop de code met elke optie na.', en: 'The rest of the code is fine; only the highlighted line must change. Trace the code with each option.' },
  };
  return [
    first[type],
    prog[tipIndex].def.tip(prog[tipIndex].p),
    { nl: `Vlak voor regel ${line}: ${describe(before)}`, en: `Right before line ${line}: ${describe(before)}` },
  ];
}

function asPredict(rng: Rng, level: number, prog: Program): GeneratedQuestion | null {
  const res = simulate(prog);
  if (!res.ok) return null;
  const out = res.out;
  const code = renderProgram(prog).join('\n');
  const typed = level === 2 || (level === 1 && rng.chance(0.5));
  let choices: string[] | undefined;
  if (!typed) {
    // Plausible mistakes: skipping a step, or misreading a value/operator.
    const mistakes = new Set<string>();
    for (let i = 0; i < prog.length - 1; i++) {
      const r = simulate(prog, { skip: i });
      if (r.ok) mistakes.add(r.out);
    }
    for (const tp of tweakPoints(prog)) {
      for (const alt of tp.alts) {
        const r = simulate(prog, { override: { index: tp.index, key: tp.key, value: alt } });
        if (r.ok) mistakes.add(r.out);
      }
    }
    const plausible = rng.shuffle([...mistakes]).filter((m) => m && m !== out && m.length <= MAX_OUTPUT);
    const extra = /^-?\d+$/.test(out) ? numberNeighbors(Number(out)) : [];
    choices = makeChoices(rng, out, [...plausible, ...extra]);
    if (choices.length < 4) return null;
  }
  return { code, prompt: PROMPT_PREDICT, choices, answer: out, hints: buildHints(rng, prog, 'predict'), verify: { code, output: out } };
}

function asFill(rng: Rng, prog: Program): GeneratedQuestion | null {
  const res = simulate(prog);
  if (!res.ok) return null;
  const code = renderProgram(prog).join('\n');
  for (const tp of rng.shuffle(tweakPoints(prog))) {
    const blanked = renderProgram(prog, { index: tp.index, key: tp.key, value: BLANK }).join('\n');
    if (blanked.split(BLANK).length !== 2) continue;
    const wrong = wrongAlts(prog, tp, res.out);
    if (wrong.length < 2) continue;
    return {
      code: blanked,
      prompt: promptFill(res.out),
      choices: makeChoices(rng, String(tp.value), wrong.map(String)),
      answer: String(tp.value),
      hints: buildHints(rng, prog, 'fillblank', tp.index),
      verify: { code, output: res.out },
    };
  }
  return null;
}

function asFix(rng: Rng, prog: Program): GeneratedQuestion | null {
  const res = simulate(prog);
  if (!res.ok) return null;
  const correct = renderProgram(prog);
  for (const tp of rng.shuffle(tweakPoints(prog))) {
    const wrong = wrongAlts(prog, tp, res.out);
    if (wrong.length < 2) continue;
    // Each alternative must change exactly one line, and always the same one.
    const variants = wrong.map((alt) => {
      const ls = renderProgram(prog, { index: tp.index, key: tp.key, value: alt });
      const diff = ls.flatMap((l, i) => (l !== correct[i] ? [i] : []));
      return { alt, ls, line: diff.length === 1 && ls.length === correct.length ? diff[0] : -1 };
    });
    const line = variants[0].line;
    if (line < 0 || variants.some((v) => v.line !== line)) continue;
    const bug = rng.pick(variants);
    const right = correct[line].trim();
    return {
      code: bug.ls.join('\n'),
      prompt: promptFix(res.out, line + 1),
      highlightLine: line + 1,
      choices: makeChoices(rng, right, variants.map((v) => v.ls[line].trim())),
      answer: right,
      hints: buildHints(rng, prog, 'fixbug', tp.index),
      verify: { code: correct.join('\n'), output: res.out },
    };
  }
  return null;
}

export function composeQuestion(rng: Rng, difficulty: Difficulty, type: QuestionType): GeneratedQuestion {
  const level = LEVEL[difficulty];
  for (let attempt = 0; attempt < 200; attempt++) {
    const prog = compose(rng, level);
    const q = type === 'predict' ? asPredict(rng, level, prog) : type === 'fillblank' ? asFill(rng, prog) : asFix(rng, prog);
    if (q) return q;
  }
  throw new Error(`Could not compose a ${difficulty} ${type} question`);
}
