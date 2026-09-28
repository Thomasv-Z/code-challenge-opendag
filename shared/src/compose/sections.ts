// Building blocks for composed questions. Every section renders Python from its params
// and simulates the same params in JS, so code and answer can't drift apart.
// `render` must only interpolate params (no arithmetic on them): the composer renders
// with "___" or an alternative value in place of a param to build blanks and bugs.
import type { Loc } from '../types';
import type { Rng } from '../rng';
import { floorDiv, pyMod, WORDS } from '../py';
import { PyError, read, show, write, type Kind, type State } from './state';

export type Param = string | number;
export type Params = Record<string, Param>;

export interface Tweak {
  key: string;
  alts: Param[];
}

export interface Ctx {
  rng: Rng;
  /** 0 = easy, 1 = medium, 2 = hard */
  level: number;
  state: State;
  /** An existing variable of this kind, preferring recently written ones. */
  pick(kind: Kind, exclude?: string[]): string | null;
  /** An unused name for a new variable or function. */
  fresh(kind: Kind | 'func'): string | null;
}

export interface SectionDef<P extends Params = Params> {
  id: string;
  /** Lowest level the section appears at. */
  level: number;
  /** Introduces a variable from nothing. */
  setup?: boolean;
  weight: number;
  create(ctx: Ctx): P | null;
  render(p: P): string[];
  run(s: State, p: P): void;
  tweaks?(p: P): Tweak[];
  /** Variables this section assigns; the print section picks from these. */
  writes(p: P): string[];
  /** Short explanation of the construct, used as a hint. */
  tip(p: P): Loc;
}

const define = <P extends Params>(def: SectionDef<P>) => def as unknown as SectionDef;
const int = (s: State, n: string) => read(s, n, 'int');
const str = (s: State, n: string) => read(s, n, 'str');
const list = (s: State, n: string) => read(s, n, 'list');
const near = (rng: Rng, v: number, spread: number) => v + rng.int(-spread, spread);
const others = <T>(all: readonly T[], v: T) => all.filter((x) => x !== v);

function arith(a: number, op: string, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '//':
      if (b === 0) throw new PyError('ZeroDivisionError');
      return floorDiv(a, b);
    case '%':
      if (b === 0) throw new PyError('ZeroDivisionError');
      return pyMod(a, b);
  }
  throw new Error(`unknown op ${op}`);
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
  throw new Error(`unknown comparison ${op}`);
}

const pySlice = <T>(items: T[], a: Param, b: Param, step: Param): T[] => {
  const base = items.slice(a === '' ? undefined : Number(a), b === '' ? undefined : Number(b));
  if (step === -1) return [...items].reverse();
  if (step === 2) return base.filter((_, i) => i % 2 === 0);
  return base;
};
const sliceSrc = (a: Param, b: Param, step: Param) => (step === 1 ? `[${a}:${b}]` : `[::${step}]`);

// ---------------------------------------------------------------- setup

const intVar = define<{ t: string; v: number }>({
  id: 'int-var', level: 0, setup: true, weight: 1,
  create: ({ rng, level, fresh }) => {
    const t = fresh('int');
    return t ? { t, v: level === 2 ? rng.int(-6, 30) : rng.int(2, level ? 25 : 15) } : null;
  },
  render: (p) => [`${p.t} = ${p.v}`],
  run: (s, p) => write(s, p.t, Number(p.v)),
  tweaks: (p) => [{ key: 'v', alts: [p.v + 1, p.v - 1, p.v + 2] }],
  writes: (p) => [p.t],
  tip: (p) => ({ nl: `${p.t} begint op ${p.v}.`, en: `${p.t} starts at ${p.v}.` }),
});

const strVar = define<{ t: string; v: string }>({
  id: 'str-var', level: 0, setup: true, weight: 1,
  create: ({ rng, fresh }) => {
    const t = fresh('str');
    return t ? { t, v: rng.pick(WORDS.filter((w) => w.length <= 7)) } : null;
  },
  render: (p) => [`${p.t} = "${p.v}"`],
  run: (s, p) => write(s, p.t, String(p.v)),
  writes: (p) => [p.t],
  tip: (p) => ({ nl: `"${p.v}" heeft ${p.v.length} letters; tel indexen vanaf 0.`, en: `"${p.v}" has ${p.v.length} letters; indexes count from 0.` }),
});

const listVar = define<{ t: string; v: string }>({
  id: 'list-var', level: 1, setup: true, weight: 1,
  create: ({ rng, fresh }) => {
    const t = fresh('list');
    const nums = rng.sample(Array.from({ length: 20 }, (_, i) => i + 1), rng.int(3, 5));
    return t ? { t, v: nums.join(', ') } : null;
  },
  render: (p) => [`${p.t} = [${p.v}]`],
  run: (s, p) => write(s, p.t, String(p.v).split(', ').map(Number)),
  writes: (p) => [p.t],
  tip: (p) => ({ nl: `${p.t} begint met ${p.v.split(', ').length} getallen.`, en: `${p.t} starts with ${p.v.split(', ').length} numbers.` }),
});

// ---------------------------------------------------------------- ints

const AUG_BASIC = ['+=', '-=', '*='];
const AUG_ALL = [...AUG_BASIC, '//=', '%='];

const augAssign = define<{ t: string; op: string; k: Param }>({
  id: 'aug-assign', level: 0, weight: 4,
  create: ({ rng, level, pick }) => {
    const t = pick('int');
    if (!t) return null;
    const op = rng.pick(level ? AUG_ALL : AUG_BASIC);
    const other = level && rng.chance(0.3) ? pick('int', [t]) : null;
    const k = other ?? (op === '*=' ? rng.int(2, 4) : op === '//=' || op === '%=' ? rng.int(2, 5) : rng.int(1, 9));
    return { t, op, k };
  },
  render: (p) => [`${p.t} ${p.op} ${p.k}`],
  run: (s, p) => {
    const b = typeof p.k === 'number' ? p.k : int(s, p.k);
    write(s, p.t, arith(int(s, p.t), p.op.slice(0, -1), b));
  },
  tweaks: (p) => [
    { key: 'op', alts: others(AUG_ALL, p.op) },
    ...(typeof p.k === 'number' ? [{ key: 'k', alts: [p.k + 1, p.k - 1, p.k + 2] }] : []),
  ],
  writes: (p) => [p.t],
  tip: (p) => ({
    nl: `\`${p.t} ${p.op} ${p.k}\` betekent \`${p.t} = ${p.t} ${p.op.slice(0, -1)} ${p.k}\`.${p.op === '//=' ? ' `//` deelt en rondt naar beneden af.' : p.op === '%=' ? ' `%` geeft de rest na delen.' : ''}`,
    en: `\`${p.t} ${p.op} ${p.k}\` means \`${p.t} = ${p.t} ${p.op.slice(0, -1)} ${p.k}\`.${p.op === '//=' ? ' `//` divides and rounds down.' : p.op === '%=' ? ' `%` gives the remainder.' : ''}`,
  }),
});

const CMP_BASIC = ['>', '<', '>='];
const CMP_ALL = ['>', '<', '>=', '<=', '==', '!='];

const ifElse = define<{ t: string; cmp: string; th: number; a: number; e: string; b: number }>({
  id: 'if-else', level: 0, weight: 3,
  create: ({ rng, level, pick, state }) => {
    const t = pick('int');
    if (!t) return null;
    const cmp = rng.pick(level ? CMP_ALL : CMP_BASIC);
    const cur = int(state, t);
    const th = cmp === '==' || cmp === '!=' ? cur + rng.int(0, 1) : near(rng, cur, 2);
    const e = level && rng.chance(0.4) ? (pick('int', [t]) ?? t) : t;
    return { t, cmp, th, a: rng.int(1, 9), e, b: rng.int(1, 9) };
  },
  render: (p) => [`if ${p.t} ${p.cmp} ${p.th}:`, `    ${p.t} += ${p.a}`, 'else:', `    ${p.e} -= ${p.b}`],
  run: (s, p) => {
    if (compare(int(s, p.t), p.cmp, p.th)) write(s, p.t, int(s, p.t) + p.a);
    else write(s, p.e, int(s, p.e) - p.b);
  },
  tweaks: (p) => [
    { key: 'cmp', alts: others(CMP_ALL, p.cmp) },
    { key: 'th', alts: [p.th - 1, p.th + 1] },
  ],
  writes: (p) => [...new Set([p.t, p.e])],
  tip: (p) => ({
    nl: `Kijk eerst of \`${p.t} ${p.cmp} ${p.th}\` waar is; alleen dat ene blok wordt uitgevoerd.`,
    en: `First check whether \`${p.t} ${p.cmp} ${p.th}\` is true; only that one block runs.`,
  }),
});

const minMax = define<{ t: string; fn: string; k: number }>({
  id: 'min-max', level: 0, weight: 2,
  create: ({ rng, pick, state }) => {
    const t = pick('int');
    if (!t) return null;
    const cur = int(state, t);
    let k = near(rng, cur, 4);
    if (k === cur) k += 1;
    return { t, fn: rng.pick(['max', 'min']), k };
  },
  render: (p) => [`${p.t} = ${p.fn}(${p.t}, ${p.k})`],
  run: (s, p) => write(s, p.t, (p.fn === 'max' ? Math.max : Math.min)(int(s, p.t), p.k)),
  tweaks: (p) => [{ key: 'fn', alts: others(['max', 'min'], p.fn) }, { key: 'k', alts: [p.k - 1, p.k + 1, p.k + 3] }],
  writes: (p) => [p.t],
  tip: (p) => ({ nl: `\`${p.fn}\` kiest de ${p.fn === 'max' ? 'grootste' : 'kleinste'} van de twee.`, en: `\`${p.fn}\` picks the ${p.fn === 'max' ? 'larger' : 'smaller'} of the two.` }),
});

const forRange = define<{ t: string; a: number; b: number; op: string; m: number }>({
  id: 'for-range', level: 1, weight: 3,
  create: ({ rng, pick }) => {
    const t = pick('int');
    if (!t) return null;
    const a = rng.int(0, 3);
    return { t, a, b: a + rng.int(2, 5), op: rng.pick(['+=', '+=', '-=']), m: rng.chance(0.35) ? rng.int(2, 3) : 1 };
  },
  render: (p) => [`for i in range(${p.a}, ${p.b}):`, p.m === 1 ? `    ${p.t} ${p.op} i` : `    ${p.t} ${p.op} i * ${p.m}`],
  run: (s, p) => {
    for (let i = p.a; i < p.b; i++) write(s, p.t, arith(int(s, p.t), p.op[0], i * p.m));
  },
  tweaks: (p) => [
    { key: 'b', alts: [p.b + 1, p.b - 1] },
    { key: 'a', alts: [p.a + 1, p.a - 1] },
    { key: 'op', alts: others(['+=', '-=', '*='], p.op) },
  ],
  writes: (p) => [p.t],
  tip: (p) => ({
    nl: `\`range(${p.a}, ${p.b})\` geeft ${p.a} t/m ${p.b - 1}; ${p.b} zelf doet niet mee.`,
    en: `\`range(${p.a}, ${p.b})\` gives ${p.a} to ${p.b - 1}; ${p.b} itself is not included.`,
  }),
});

const forEach = define<{ l: string; t: string; filter: string; r: number; th: number }>({
  id: 'for-each', level: 1, weight: 3,
  create: ({ rng, pick, state }) => {
    const l = pick('list');
    const t = pick('int');
    if (!l || !t) return null;
    const vals = list(state, l);
    return { l, t, filter: rng.pick(['none', 'mod', 'gt']), r: rng.int(0, 1), th: vals.length ? rng.pick(vals) : 5 };
  },
  render: (p) =>
    p.filter === 'none'
      ? [`for n in ${p.l}:`, `    ${p.t} += n`]
      : [`for n in ${p.l}:`, p.filter === 'mod' ? `    if n % 2 == ${p.r}:` : `    if n > ${p.th}:`, `        ${p.t} += n`],
  run: (s, p) => {
    for (const n of list(s, p.l)) {
      const ok = p.filter === 'none' || (p.filter === 'mod' ? pyMod(n, 2) === p.r : n > p.th);
      if (ok) write(s, p.t, int(s, p.t) + n);
    }
  },
  tweaks: (p) => (p.filter === 'mod' ? [{ key: 'r', alts: [1 - p.r] }] : p.filter === 'gt' ? [{ key: 'th', alts: [p.th - 1, p.th + 1, p.th + 3] }] : []),
  writes: (p) => [p.t],
  tip: (p) => ({
    nl: `n loopt één voor één langs alle getallen in ${p.l}${p.filter === 'mod' ? `; alleen ${p.r ? 'oneven' : 'even'} getallen tellen mee` : p.filter === 'gt' ? `; alleen getallen groter dan ${p.th} tellen mee` : ''}.`,
    en: `n goes through every number in ${p.l} one by one${p.filter === 'mod' ? `; only ${p.r ? 'odd' : 'even'} numbers count` : p.filter === 'gt' ? `; only numbers greater than ${p.th} count` : ''}.`,
  }),
});

const funcCall = define<{ f: string; t: string; form: string; k: number; c: number }>({
  id: 'func-call', level: 1, weight: 2,
  create: ({ rng, pick, fresh }) => {
    const t = pick('int');
    const f = fresh('func');
    if (!t || !f) return null;
    return { f, t, form: rng.pick(['a * k + c', '(a + c) * k', 'a * k - c']), k: rng.int(2, 4), c: rng.int(1, 9) };
  },
  render: (p) => [
    `def ${p.f}(a):`,
    `    return ${p.form.replace('k', String(p.k)).replace('c', String(p.c))}`,
    `${p.t} = ${p.f}(${p.t})`,
  ],
  run: (s, p) => {
    const a = int(s, p.t);
    write(s, p.t, p.form === 'a * k + c' ? a * p.k + p.c : p.form === '(a + c) * k' ? (a + p.c) * p.k : a * p.k - p.c);
  },
  tweaks: (p) => [{ key: 'k', alts: [p.k + 1, p.k - 1] }, { key: 'c', alts: [p.c + 1, p.c - 1] }],
  writes: (p) => [p.t],
  tip: (p) => ({
    nl: `Bij \`${p.f}(${p.t})\` krijgt parameter a de waarde van ${p.t}; het resultaat komt weer in ${p.t}.`,
    en: `In \`${p.f}(${p.t})\` parameter a gets the value of ${p.t}; the result is stored back in ${p.t}.`,
  }),
});

const whileHalve = define<{ t: string; c: string; bound: number; d: number }>({
  id: 'while-halve', level: 2, weight: 2,
  create: ({ rng, pick, fresh, state }) => {
    const t = pick('int');
    const c = fresh('int');
    if (!t || !c || int(state, t) < 2) return null;
    return { t, c, bound: 1, d: rng.pick([2, 2, 3]) };
  },
  render: (p) => [`${p.c} = 0`, `while ${p.t} > ${p.bound}:`, `    ${p.t} //= ${p.d}`, `    ${p.c} += 1`],
  run: (s, p) => {
    write(s, p.c, 0);
    while (int(s, p.t) > p.bound) {
      write(s, p.t, floorDiv(int(s, p.t), p.d));
      write(s, p.c, int(s, p.c) + 1);
    }
  },
  tweaks: (p) => [{ key: 'bound', alts: [0, 2] }, { key: 'd', alts: others([2, 3, 4], p.d) }],
  writes: (p) => [p.c, p.t],
  tip: (p) => ({
    nl: `De lus gaat door zolang ${p.t} groter is dan ${p.bound}; ${p.c} telt het aantal rondes.`,
    en: `The loop runs while ${p.t} is greater than ${p.bound}; ${p.c} counts the rounds.`,
  }),
});

const ternary = define<{ t: string; kind: string; r: number; th: number; k: number }>({
  id: 'ternary', level: 2, weight: 2,
  create: ({ rng, pick, state }) => {
    const t = pick('int');
    if (!t) return null;
    return { t, kind: rng.pick(['collatz', 'threshold']), r: 0, th: near(rng, int(state, t), 2), k: rng.int(2, 6) };
  },
  render: (p) => [
    p.kind === 'collatz'
      ? `${p.t} = ${p.t} // 2 if ${p.t} % 2 == ${p.r} else 3 * ${p.t} + 1`
      : `${p.t} = ${p.t} - ${p.k} if ${p.t} > ${p.th} else ${p.t} + ${p.k}`,
  ],
  run: (s, p) => {
    const v = int(s, p.t);
    write(s, p.t, p.kind === 'collatz' ? (pyMod(v, 2) === p.r ? floorDiv(v, 2) : 3 * v + 1) : v > p.th ? v - p.k : v + p.k);
  },
  tweaks: (p) => (p.kind === 'collatz' ? [{ key: 'r', alts: [1] }] : [{ key: 'th', alts: [p.th - 1, p.th + 1] }, { key: 'k', alts: [p.k + 1, p.k - 1] }]),
  writes: (p) => [p.t],
  tip: (p) => ({
    nl: '`A if voorwaarde else B` geeft A als de voorwaarde waar is, anders B.',
    en: '`A if condition else B` gives A when the condition is true, otherwise B.',
  }),
});

// ---------------------------------------------------------------- lists

const listMutate = define<{ l: string; op: string; v: number }>({
  id: 'list-mutate', level: 1, weight: 3,
  create: ({ rng, pick, state }) => {
    const l = pick('list');
    if (!l) return null;
    const vals = list(state, l);
    const ops = [...(vals.length < 7 ? ['append', 'insert'] : []), ...(vals.length > 1 ? ['pop', 'remove'] : [])];
    if (!ops.length) return null;
    const op = rng.pick(ops);
    return { l, op, v: op === 'remove' ? rng.pick(vals) : rng.int(1, 30) };
  },
  render: (p) => [
    p.op === 'append' ? `${p.l}.append(${p.v})` : p.op === 'insert' ? `${p.l}.insert(0, ${p.v})` : p.op === 'pop' ? `${p.l}.pop()` : `${p.l}.remove(${p.v})`,
  ],
  run: (s, p) => {
    const l = [...list(s, p.l)];
    if (p.op === 'append') l.push(p.v);
    else if (p.op === 'insert') l.unshift(p.v);
    else if (p.op === 'pop') {
      if (!l.length) throw new PyError('IndexError');
      l.pop();
    } else {
      const i = l.indexOf(p.v);
      if (i < 0) throw new PyError('ValueError');
      l.splice(i, 1);
    }
    write(s, p.l, l);
  },
  writes: (p) => [p.l],
  tip: (p) => ({
    nl: `\`${p.op}\` verandert de lijst zelf: append voegt achteraan toe, insert(0, ..) vooraan, pop() haalt de laatste weg, remove(v) de eerste v.`,
    en: `\`${p.op}\` changes the list itself: append adds to the end, insert(0, ..) to the front, pop() removes the last, remove(v) the first v.`,
  }),
});

const listSlice = define<{ l: string; a: Param; b: Param; step: Param }>({
  id: 'list-slice', level: 1, weight: 2,
  create: ({ rng, pick, state }) => {
    const l = pick('list');
    if (!l) return null;
    const n = list(state, l).length;
    if (n < 3) return null;
    const kind = rng.int(0, 3);
    if (kind === 0) return { l, a: '', b: '', step: -1 };
    if (kind === 1) return { l, a: '', b: '', step: 2 };
    const a = rng.int(0, n - 2);
    return kind === 2 ? { l, a, b: rng.int(a + 1, n), step: 1 } : { l, a, b: '', step: 1 };
  },
  render: (p) => [`${p.l} = ${p.l}${sliceSrc(p.a, p.b, p.step)}`],
  run: (s, p) => write(s, p.l, pySlice(list(s, p.l), p.a, p.b, p.step)),
  tweaks: (p) => [
    ...(typeof p.a === 'number' ? [{ key: 'a', alts: [p.a + 1, p.a - 1] }] : []),
    ...(typeof p.b === 'number' ? [{ key: 'b', alts: [p.b + 1, p.b - 1] }] : []),
  ],
  writes: (p) => [p.l],
  tip: (p) => ({
    nl: p.step === -1 ? '`[::-1]` draait de lijst om.' : p.step === 2 ? '`[::2]` neemt elk tweede element, vanaf index 0.' : '`[a:b]` neemt index a tot (niet t/m) b.',
    en: p.step === -1 ? '`[::-1]` reverses the list.' : p.step === 2 ? '`[::2]` takes every second element, starting at index 0.' : '`[a:b]` takes index a up to (not including) b.',
  }),
});

const LIST_FNS = ['sum', 'len', 'max', 'min'];

const listToInt = define<{ l: string; t: string; fn: string; aug: number }>({
  id: 'list-to-int', level: 1, weight: 3,
  create: ({ rng, pick, fresh }) => {
    const l = pick('list');
    if (!l) return null;
    const existing = rng.chance(0.5) ? pick('int') : null;
    const t = existing ?? fresh('int');
    return t ? { l, t, fn: rng.pick(LIST_FNS), aug: existing ? 1 : 0 } : null;
  },
  render: (p) => [p.aug ? `${p.t} += ${p.fn}(${p.l})` : `${p.t} = ${p.fn}(${p.l})`],
  run: (s, p) => {
    const l = list(s, p.l);
    if ((p.fn === 'max' || p.fn === 'min') && !l.length) throw new PyError('ValueError');
    const v = p.fn === 'sum' ? l.reduce((a, b) => a + b, 0) : p.fn === 'len' ? l.length : (p.fn === 'max' ? Math.max : Math.min)(...l);
    write(s, p.t, p.aug ? int(s, p.t) + v : v);
  },
  tweaks: (p) => [{ key: 'fn', alts: others(LIST_FNS, p.fn) }],
  writes: (p) => [p.t],
  tip: (p) => ({
    nl: `\`${p.fn}(${p.l})\` geeft ${p.fn === 'sum' ? 'de som' : p.fn === 'len' ? 'het aantal elementen' : p.fn === 'max' ? 'het grootste getal' : 'het kleinste getal'} van de lijst op dat moment.`,
    en: `\`${p.fn}(${p.l})\` gives ${p.fn === 'sum' ? 'the sum' : p.fn === 'len' ? 'the number of elements' : p.fn === 'max' ? 'the largest number' : 'the smallest number'} of the list at that moment.`,
  }),
});

const comprehension = define<{ l: string; map: string; k: number; filter: string; th: number; r: number }>({
  id: 'comprehension', level: 2, weight: 3,
  create: ({ rng, pick, state }) => {
    const l = pick('list');
    if (!l) return null;
    const vals = list(state, l);
    const map = rng.pick(['x', 'x * k', 'x + k', 'x % k']);
    const filter = map === 'x' ? rng.pick(['mod', 'gt']) : rng.pick(['none', 'mod', 'gt']);
    return { l, map, k: rng.int(2, 4), filter, th: vals.length ? rng.pick(vals) : 5, r: rng.int(0, 1) };
  },
  render: (p) => {
    const expr = p.map.replace('k', String(p.k));
    const cond = p.filter === 'mod' ? ` if x % 2 == ${p.r}` : p.filter === 'gt' ? ` if x > ${p.th}` : '';
    return [`${p.l} = [${expr} for x in ${p.l}${cond}]`];
  },
  run: (s, p) => {
    const keep = (x: number) => (p.filter === 'mod' ? pyMod(x, 2) === p.r : p.filter === 'gt' ? x > p.th : true);
    const f = (x: number) => (p.map === 'x' ? x : p.map === 'x * k' ? x * p.k : p.map === 'x + k' ? x + p.k : pyMod(x, p.k));
    write(s, p.l, list(s, p.l).filter(keep).map(f));
  },
  tweaks: (p) => [
    ...(p.map !== 'x' ? [{ key: 'k', alts: [p.k + 1, p.k - 1] }] : []),
    ...(p.filter === 'mod' ? [{ key: 'r', alts: [1 - p.r] }] : p.filter === 'gt' ? [{ key: 'th', alts: [p.th - 1, p.th + 1] }] : []),
  ],
  writes: (p) => [p.l],
  tip: () => ({
    nl: 'Lees het als: voor elke x in de lijst, als de voorwaarde klopt, neem de expressie vooraan.',
    en: 'Read it as: for each x in the list, if the condition holds, take the expression at the front.',
  }),
});

const listOrder = define<{ l: string; op: string }>({
  id: 'list-order', level: 2, weight: 1,
  create: ({ rng, pick }) => {
    const l = pick('list');
    return l ? { l, op: rng.pick(['sort', 'reverse', 'sortdesc']) } : null;
  },
  render: (p) => [p.op === 'sort' ? `${p.l}.sort()` : p.op === 'reverse' ? `${p.l}.reverse()` : `${p.l}.sort(reverse=True)`],
  run: (s, p) => {
    const l = [...list(s, p.l)];
    if (p.op === 'sort') l.sort((a, b) => a - b);
    else if (p.op === 'reverse') l.reverse();
    else l.sort((a, b) => b - a);
    write(s, p.l, l);
  },
  writes: (p) => [p.l],
  tip: (p) => ({
    nl: p.op === 'reverse' ? '`reverse()` draait de volgorde om, zonder te sorteren.' : '`sort()` sorteert de lijst zelf, van klein naar groot (of andersom met reverse=True).',
    en: p.op === 'reverse' ? '`reverse()` flips the order without sorting.' : '`sort()` sorts the list in place, small to large (or the other way with reverse=True).',
  }),
});

// ---------------------------------------------------------------- strings

const CASES = ['upper', 'lower', 'capitalize'];
const applyCase = (s: string, m: string) =>
  m === 'upper' ? s.toUpperCase() : m === 'lower' ? s.toLowerCase() : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const strCase = define<{ s: string; m: string }>({
  id: 'str-case', level: 0, weight: 2,
  create: ({ rng, pick, state }) => {
    const s = pick('str');
    if (!s) return null;
    const cur = str(state, s);
    const useful = CASES.filter((m) => applyCase(cur, m) !== cur);
    return useful.length ? { s, m: rng.pick(useful) } : null;
  },
  render: (p) => [`${p.s} = ${p.s}.${p.m}()`],
  run: (s, p) => write(s, p.s, applyCase(str(s, p.s), p.m)),
  tweaks: (p) => [{ key: 'm', alts: others(CASES, p.m) }],
  writes: (p) => [p.s],
  tip: () => ({
    nl: '`upper()` maakt alles hoofdletters, `lower()` alles kleine letters, `capitalize()` alleen de eerste letter groot.',
    en: '`upper()` makes everything uppercase, `lower()` lowercase, `capitalize()` only the first letter uppercase.',
  }),
});

const strConcat = define<{ s: string; kind: string; t: string; k: number; suffix: string }>({
  id: 'str-concat', level: 0, weight: 3,
  create: ({ rng, pick, state }) => {
    const s = pick('str');
    if (!s) return null;
    const t = pick('int');
    const len = str(state, s).length;
    const kinds = [...(t ? ['int', 'int'] : []), 'suffix', ...(len <= 8 ? ['repeat'] : [])];
    return { s, kind: rng.pick(kinds), t: t ?? '', k: rng.int(2, 3), suffix: rng.pick(['!', '?', '_1', 'X']) };
  },
  render: (p) => [
    p.kind === 'int' ? `${p.s} = ${p.s} + str(${p.t})` : p.kind === 'repeat' ? `${p.s} = ${p.s} * ${p.k}` : `${p.s} = ${p.s} + "${p.suffix}"`,
  ],
  run: (s, p) => {
    const cur = str(s, p.s);
    write(s, p.s, p.kind === 'int' ? cur + String(int(s, p.t)) : p.kind === 'repeat' ? cur.repeat(p.k) : cur + p.suffix);
  },
  tweaks: (p) => (p.kind === 'repeat' ? [{ key: 'k', alts: [p.k + 1, p.k - 1] }] : []),
  writes: (p) => [p.s],
  tip: (p) => ({
    nl: p.kind === 'int' ? '`str(...)` maakt van een getal tekst, zodat je het met + achter een string kunt plakken.' : p.kind === 'repeat' ? '`*` met een string herhaalt die string.' : '`+` plakt strings aan elkaar, zonder spatie.',
    en: p.kind === 'int' ? '`str(...)` turns a number into text so + can glue it onto a string.' : p.kind === 'repeat' ? '`*` on a string repeats it.' : '`+` glues strings together, without a space.',
  }),
});

const strSlice = define<{ s: string; a: Param; b: Param; step: Param }>({
  id: 'str-slice', level: 1, weight: 2,
  create: ({ rng, pick, state }) => {
    const s = pick('str');
    if (!s) return null;
    const n = str(state, s).length;
    if (n < 3) return null;
    const kind = rng.int(0, 2);
    if (kind === 0) return { s, a: '', b: '', step: -1 };
    const a = rng.int(0, n - 2);
    return kind === 1 ? { s, a, b: rng.int(a + 1, n), step: 1 } : { s, a: '', b: rng.int(1, n - 1), step: 1 };
  },
  render: (p) => [`${p.s} = ${p.s}${sliceSrc(p.a, p.b, p.step)}`],
  run: (s, p) => write(s, p.s, pySlice([...str(s, p.s)], p.a, p.b, p.step).join('')),
  tweaks: (p) => [
    ...(typeof p.a === 'number' ? [{ key: 'a', alts: [p.a + 1, p.a - 1] }] : []),
    ...(typeof p.b === 'number' ? [{ key: 'b', alts: [p.b + 1, p.b - 1] }] : []),
  ],
  writes: (p) => [p.s],
  tip: (p) => ({
    nl: p.step === -1 ? '`[::-1]` draait de string om.' : 'Bij `[a:b]` doet index b zelf niet mee; een lege a betekent vanaf het begin.',
    en: p.step === -1 ? '`[::-1]` reverses the string.' : 'In `[a:b]` index b itself is not included; an empty a means from the start.',
  }),
});

const strToInt = define<{ s: string; t: string; fn: string; c: string; aug: number }>({
  id: 'str-to-int', level: 1, weight: 2,
  create: ({ rng, pick, fresh, state }) => {
    const s = pick('str');
    if (!s) return null;
    const existing = rng.chance(0.4) ? pick('int') : null;
    const t = existing ?? fresh('int');
    if (!t) return null;
    const letters = [...new Set(str(state, s))];
    return { s, t, fn: rng.pick(['len', 'count', 'find']), c: letters.length ? rng.pick(letters) : 'a', aug: existing ? 1 : 0 };
  },
  render: (p) => {
    const expr = p.fn === 'len' ? `len(${p.s})` : `${p.s}.${p.fn}("${p.c}")`;
    return [p.aug ? `${p.t} += ${expr}` : `${p.t} = ${expr}`];
  },
  run: (s, p) => {
    const cur = str(s, p.s);
    const v = p.fn === 'len' ? cur.length : p.fn === 'count' ? cur.split(p.c).length - 1 : cur.indexOf(p.c);
    write(s, p.t, p.aug ? int(s, p.t) + v : v);
  },
  tweaks: (p) => (p.fn === 'len' ? [] : [{ key: 'c', alts: others(['a', 'e', 'o', 't', 'r', 'x', 'd'], p.c) }]),
  writes: (p) => [p.t],
  tip: (p) => ({
    nl: p.fn === 'len' ? '`len` telt het aantal tekens.' : p.fn === 'count' ? `\`count("${p.c}")\` telt hoe vaak "${p.c}" voorkomt (hoofdletters tellen apart).` : `\`find("${p.c}")\` geeft de index van de eerste "${p.c}", of -1 als die er niet in zit.`,
    en: p.fn === 'len' ? '`len` counts the characters.' : p.fn === 'count' ? `\`count("${p.c}")\` counts how often "${p.c}" occurs (case-sensitive).` : `\`find("${p.c}")\` gives the index of the first "${p.c}", or -1 if it isn't there.`,
  }),
});

// ---------------------------------------------------------------- output

export const printSection = define<{ a: string; b: string }>({
  id: 'print', level: 0, weight: 0,
  create: () => null, // built by the composer, which knows what was written last
  render: (p) => [p.b ? `print(${p.a}, ${p.b})` : `print(${p.a})`],
  run: (s, p) => {
    const value = (n: string) => {
      const v = s.vars.get(n);
      if (v === undefined) throw new PyError(`NameError: ${n}`);
      return show(v);
    };
    s.out.push(p.b ? `${value(p.a)} ${value(p.b)}` : value(p.a));
  },
  writes: () => [],
  tip: () => ({ nl: 'print met een komma zet een spatie tussen de waarden.', en: 'print with a comma puts a space between the values.' }),
});

export const SECTIONS: SectionDef[] = [
  intVar, strVar, listVar,
  augAssign, ifElse, minMax, forRange, forEach, funcCall, whileHalve, ternary,
  listMutate, listSlice, listToInt, comprehension, listOrder,
  strCase, strConcat, strSlice, strToInt,
];
