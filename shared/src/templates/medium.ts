import type { Loc, Template } from '../types';
import type { Rng } from '../rng';
import {
  LIST_NAMES, PROMPT_PREDICT, WORDS, floorDiv, lines, makeChoices, numberNeighbors,
  promptFill, promptFix, pyRepr,
} from '../py';

const range = (start: number, stop: number, step = 1) => {
  const out: number[] = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) out.push(i);
  return out;
};

const distinctInts = (rng: Rng, n: number, min: number, max: number) =>
  rng.sample(range(min, max + 1), n);

const TYPED_HINT: Loc = {
  nl: 'Meerdere waarden? Typ ze gewoon achter elkaar met spaties.',
  en: 'Multiple values? Just type them separated by spaces.',
};

const loopSum: Template = {
  id: 'medium-loop-sum',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const start = rng.int(0, 4);
    const stop = start + rng.int(3, 7);
    const step = rng.chance(0.3) ? 2 : 1;
    const variant = rng.int(0, 2);
    const k = rng.int(2, 3);
    const values = range(start, stop, step);
    const rangeStr = step === 1 ? `range(${start}, ${stop})` : `range(${start}, ${stop}, ${step})`;
    const body =
      variant === 0 ? ['    total += i']
        : variant === 1 ? [`    total += i * ${k}`]
          : ['    if i % 2 == 0:', '        total += i'];
    const used = variant === 2 ? values.filter((v) => v % 2 === 0) : values;
    const total = used.reduce((s, v) => s + (variant === 1 ? v * k : v), 0);
    const code = lines('total = 0', `for i in ${rangeStr}:`, ...body, 'print(total)');
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: String(total),
      hints: [
        { nl: `\`${rangeStr}\` stopt vóór ${stop}; ${stop} zelf doet niet mee.`, en: `\`${rangeStr}\` stops before ${stop}; ${stop} itself is not included.` },
        { nl: `i neemt de waarden ${values.join(', ')} aan.`, en: `i takes the values ${values.join(', ')}.` },
        { nl: `Tel op: ${used.map((v) => (variant === 1 ? `${v}×${k}` : v)).join(' + ') || '(niets)'}`, en: `Add up: ${used.map((v) => (variant === 1 ? `${v}×${k}` : v)).join(' + ') || '(nothing)'}` },
      ],
      verify: { code, output: String(total) },
    };
  },
};

const listSlice: Template = {
  id: 'medium-list-slice',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const name = rng.pick(LIST_NAMES);
    const nums = distinctInts(rng, 6, 1, 30);
    const a = rng.int(1, 3), b = a + rng.int(2, 3);
    const k = rng.int(2, 3);
    const variants: { expr: string; val: number[] | number; wrong: (number[] | number)[]; hint: Loc }[] = [
      {
        expr: `${name}[${a}:${b}]`, val: nums.slice(a, b),
        wrong: [nums.slice(a, b + 1), nums.slice(a - 1, b), nums.slice(a + 1, b + 1)],
        hint: { nl: `Van index ${a} tot (niet t/m) index ${b}.`, en: `From index ${a} up to (not including) index ${b}.` },
      },
      {
        expr: `${name}[-${k}:]`, val: nums.slice(-k),
        wrong: [nums.slice(-k - 1), nums.slice(0, k), nums.slice(-k + 1)],
        hint: { nl: `De laatste ${k} elementen.`, en: `The last ${k} elements.` },
      },
      {
        expr: `${name}[::2]`, val: nums.filter((_, i) => i % 2 === 0),
        wrong: [nums.filter((_, i) => i % 2 === 1), nums.slice(0, 2), nums.slice(0, 3)],
        hint: { nl: 'Begin bij index 0 en neem elke tweede.', en: 'Start at index 0 and take every second one.' },
      },
      {
        expr: `${name}[${a}] + ${name}[-1]`, val: nums[a] + nums[5],
        wrong: [nums[a + 1] + nums[5], nums[a - 1] + nums[5], nums[a] + nums[4]],
        hint: { nl: `${name}[${a}] is ${nums[a]}.`, en: `${name}[${a}] is ${nums[a]}.` },
      },
    ];
    const v = rng.pick(variants);
    const answer = pyRepr(v.val);
    const code = lines(`${name} = ${pyRepr(nums)}`, `print(${v.expr})`);
    const extra = typeof v.val === 'number' ? numberNeighbors(v.val) : [pyRepr(nums.slice(0, b))];
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, [...v.wrong.map(pyRepr), ...extra]),
      answer,
      hints: [
        { nl: 'Indexen beginnen bij 0; negatieve indexen tellen vanaf het einde.', en: 'Indexes start at 0; negative indexes count from the end.' },
        { nl: 'Bij een slice `[start:stop]` doet `stop` zelf niet mee.', en: 'In a slice `[start:stop]`, `stop` itself is not included.' },
        v.hint,
      ],
      verify: { code, output: answer },
    };
  },
};

const whileLoop: Template = {
  id: 'medium-while',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    let code: string, answer: string, hints: Loc[];
    if (rng.chance(0.5)) {
      const n = rng.int(20, 200), d = rng.pick([2, 3]);
      let x = n, count = 0;
      const trail = [x];
      while (x > 1) { x = floorDiv(x, d); count++; trail.push(x); }
      code = lines(`n = ${n}`, 'count = 0', 'while n > 1:', `    n = n // ${d}`, '    count += 1', 'print(count)');
      answer = String(count);
      hints = [
        { nl: 'De lus gaat door zolang n groter is dan 1.', en: 'The loop keeps going while n is greater than 1.' },
        { nl: `\`//\` deelt en rondt naar beneden af: ${n} // ${d} = ${floorDiv(n, d)}.`, en: `\`//\` divides and rounds down: ${n} // ${d} = ${floorDiv(n, d)}.` },
        { nl: `n wordt achtereenvolgens: ${trail.join(' → ')}`, en: `n goes: ${trail.join(' → ')}` },
      ];
    } else {
      const s = rng.int(3, 7), t = rng.int(15, 40);
      let x = 0, steps = 0;
      while (x < t) { x += s; steps++; }
      code = lines('level = 0', 'steps = 0', `while level < ${t}:`, `    level += ${s}`, '    steps += 1', 'print(level, steps)');
      answer = `${x} ${steps}`;
      hints = [
        { nl: `De lus stopt zodra level ${t} of meer is.`, en: `The loop stops as soon as level is ${t} or more.` },
        TYPED_HINT,
        { nl: `Na ${steps - 1} stappen is level ${x - s}, dat is nog kleiner dan ${t}.`, en: `After ${steps - 1} steps level is ${x - s}, still less than ${t}.` },
      ];
    }
    return { code, prompt: PROMPT_PREDICT, answer, hints, verify: { code, output: answer } };
  },
};

const functions: Template = {
  id: 'medium-function',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const fname = rng.pick(['calc', 'boost', 'mix', 'combine', 'score']);
    const d = rng.int(1, 5), k = rng.int(2, 4);
    const bodies = [
      { src: `x * ${k} + y`, f: (x: number, y: number) => x * k + y },
      { src: `(x + y) * ${k}`, f: (x: number, y: number) => (x + y) * k },
      { src: `x - y * ${k}`, f: (x: number, y: number) => x - y * k },
    ];
    const body = rng.pick(bodies);
    const a = rng.int(2, 9), b = rng.int(2, 9), c = rng.int(1, 9);
    const r1 = body.f(a, d), r2 = body.f(b, c);
    const answer = `${r1} ${r2}`;
    const code = lines(`def ${fname}(x, y=${d}):`, `    return ${body.src}`, '', `print(${fname}(${a}), ${fname}(${b}, ${c}))`);
    const wrong = [`${body.f(a, 0)} ${r2}`, `${r1} ${body.f(c, b)}`, `${body.f(d, a)} ${r2}`, `${r1 + 1} ${r2}`, `${r1} ${r2 + k}`];
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, wrong),
      answer,
      hints: [
        { nl: `\`y=${d}\` is een standaardwaarde: die wordt gebruikt als je y niet meegeeft.`, en: `\`y=${d}\` is a default value: it is used when you don't pass y.` },
        { nl: `In de eerste aanroep is x = ${a} en y = ${d}.`, en: `In the first call x = ${a} and y = ${d}.` },
        { nl: `De eerste aanroep geeft ${r1}.`, en: `The first call returns ${r1}.` },
      ],
      verify: { code, output: answer },
    };
  },
};

const moduloLoop: Template = {
  id: 'medium-modulo-loop',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const n = rng.int(12, 24), k = rng.int(3, 6), r = rng.int(0, k - 1);
    const vals = range(1, n).filter((i) => i % k === r);
    const countOnly = rng.chance(0.35);
    const code = countOnly
      ? lines('count = 0', `for i in range(1, ${n}):`, `    if i % ${k} == ${r}:`, '        count += 1', 'print(count)')
      : lines(`for i in range(1, ${n}):`, `    if i % ${k} == ${r}:`, '        print(i, end=" ")');
    const answer = countOnly ? String(vals.length) : vals.join(' ');
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: '`i % k` is de rest als je i deelt door k.', en: '`i % k` is the remainder when dividing i by k.' },
        countOnly ? { nl: `i loopt van 1 t/m ${n - 1}.`, en: `i goes from 1 to ${n - 1}.` } : TYPED_HINT,
        { nl: `Het eerste getal dat past is ${vals[0]}; daarna steeds +${k}.`, en: `The first number that matches is ${vals[0]}; then every +${k}.` },
      ],
      verify: { code, output: answer },
    };
  },
};

const listMethods: Template = {
  id: 'medium-list-methods',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const name = rng.pick(LIST_NAMES);
    const start = distinctInts(rng, 3, 1, 9);
    type Step = { src: string; run: (l: number[]) => void };
    const makeStep = (l: number[]): Step => {
      const x = rng.int(10, 50);
      const kind = rng.int(0, 3);
      if (kind === 0) return { src: `${name}.append(${x})`, run: (a) => { a.push(x); } };
      if (kind === 1) return { src: `${name}.insert(0, ${x})`, run: (a) => { a.unshift(x); } };
      if (kind === 2 && l.length > 1) return { src: `${name}.pop()`, run: (a) => { a.pop(); } };
      const v = rng.pick(l);
      return { src: `${name}.remove(${v})`, run: (a) => { a.splice(a.indexOf(v), 1); } };
    };
    const steps: Step[] = [];
    const cur = [...start];
    for (let i = 0; i < 3; i++) {
      const s = makeStep(cur);
      s.run(cur);
      steps.push(s);
    }
    const answer = pyRepr(cur);
    const without = steps.map((_, skip) => {
      const l = [...start];
      steps.forEach((s, i) => i !== skip && s.run(l));
      return pyRepr(l);
    });
    const code = lines(`${name} = ${pyRepr(start)}`, ...steps.map((s) => s.src), `print(${name})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, [...rng.shuffle(without), pyRepr([...cur].reverse()), pyRepr(start)]),
      answer,
      hints: [
        { nl: 'Deze methodes veranderen de lijst zelf; werk ze in volgorde af.', en: 'These methods change the list itself; apply them in order.' },
        { nl: '`append` voegt achteraan toe, `insert(0, x)` vooraan, `pop()` haalt de laatste weg, `remove(v)` haalt de waarde v weg.', en: '`append` adds to the end, `insert(0, x)` to the front, `pop()` removes the last, `remove(v)` removes the value v.' },
        { nl: `Uiteindelijk heeft de lijst ${cur.length} elementen.`, en: `In the end the list has ${cur.length} elements.` },
      ],
      verify: { code, output: answer },
    };
  },
};

const stringMethods: Template = {
  id: 'medium-string-methods',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const word = rng.pick(WORDS);
    const v = rng.pick(['word', 'text', 's']);
    const letter = rng.pick(word.split(''));
    const a = rng.int(1, 2), b = a + rng.int(2, 3);
    const variants: { expr: string; ans: string; wrong: string[]; hint: Loc }[] = [
      {
        expr: `${v}[${a}:${b}]`, ans: word.slice(a, b), wrong: [word.slice(a, b + 1), word.slice(a - 1, b), word.slice(a + 1, b + 1)],
        hint: { nl: `Letters op index ${a} t/m ${b - 1}.`, en: `Letters at index ${a} to ${b - 1}.` },
      },
      {
        expr: `${v}[::-1]`, ans: [...word].reverse().join(''), wrong: [word, word.slice(1), [...word].reverse().join('').slice(1)],
        hint: { nl: 'Een stap van -1 loopt achterstevoren door de string.', en: 'A step of -1 walks backwards through the string.' },
      },
      {
        expr: `${v}.upper()[:${b}]`, ans: word.toUpperCase().slice(0, b), wrong: [word.toUpperCase().slice(0, b + 1), word.slice(0, b), word.toUpperCase().slice(0, b - 1)],
        hint: { nl: `Eerst alles hoofdletters, dan de eerste ${b} tekens.`, en: `First everything uppercase, then the first ${b} characters.` },
      },
      {
        expr: `${v}.find("${letter}")`, ans: String(word.indexOf(letter)),
        wrong: [String(word.indexOf(letter) + 1), String(word.lastIndexOf(letter) + 1), '-1', ...numberNeighbors(word.indexOf(letter))],
        hint: { nl: '`find` geeft de index van het eerste voorkomen.', en: '`find` returns the index of the first occurrence.' },
      },
    ];
    const pick = rng.pick(variants);
    const code = lines(`${v} = "${word}"`, `print(${pick.expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      // Fallbacks for short words, where slice-based distractors can collapse into duplicates.
      choices: makeChoices(rng, pick.ans, [...pick.wrong, word, word.toUpperCase(), word.slice(1), word.slice(0, 2)]),
      answer: pick.ans,
      hints: [
        { nl: 'Strings kun je net als lijsten indexeren en slicen.', en: 'You can index and slice strings just like lists.' },
        { nl: 'Tel vanaf 0!', en: 'Count from 0!' },
        pick.hint,
      ],
      verify: { code, output: pick.ans },
    };
  },
};

const fillRange: Template = {
  id: 'medium-fill-range',
  difficulty: 'medium',
  type: 'fillblank',
  generate(rng) {
    const start = rng.int(0, 5);
    const step = rng.pick([1, 2, 3]);
    const count = rng.int(3, 5);
    const last = start + step * (count - 1);
    const out = (s: number, e: number, st: number) => range(s, e, st).join(' ');
    const fmt = (s: number, e: number, st: number) => (st === 1 ? `${s}, ${e}` : `${s}, ${e}, ${st}`);
    const correct = fmt(start, last + 1, step);
    const expected = out(start, last + 1, step);
    const candidates: [number, number, number][] = [
      [start, last, step], [start + 1, last + 1, step], [start, last + 1, 1],
      [start - 1, last, step], [start, last + step + 1, step], [0, last + 1, step], [start, last - 1, step],
    ];
    const wrong = candidates
      .filter(([s, e, st]) => out(s, e, st) !== expected && s >= 0)
      .map(([s, e, st]) => fmt(s, e, st));
    const v = rng.pick(['i', 'n', 'x', 'k', 'step']);
    const code = lines(`for ${v} in range(___):`, `    print(${v}, end=" ")`);
    return {
      code,
      prompt: promptFill(expected),
      choices: makeChoices(rng, correct, rng.shuffle(wrong)),
      answer: correct,
      hints: [
        { nl: '`range(start, stop, stap)` telt vanaf start tot (niet t/m) stop.', en: '`range(start, stop, step)` counts from start up to (not including) stop.' },
        { nl: `De eerste waarde is ${start} en het verschil tussen de getallen is ${step}.`, en: `The first value is ${start} and the gap between numbers is ${step}.` },
        { nl: `Het laatste getal is ${last}, dus stop moet groter zijn dan ${last}.`, en: `The last number is ${last}, so stop must be greater than ${last}.` },
      ],
      verify: { code: code.replace('___', correct), output: expected },
    };
  },
};

const fixLoop: Template = {
  id: 'medium-fix-loop',
  difficulty: 'medium',
  type: 'fixbug',
  generate(rng) {
    const scenario = rng.int(0, 2);
    let codeLines: string[], bugLine: number, fix: string, wrong: string[], output: string, hint: Loc;
    if (scenario === 0) {
      const n = rng.int(4, 9);
      codeLines = ['total = 0', `for i in range(1, ${n}):`, '    total += i', 'print(total)'];
      bugLine = 2;
      fix = `for i in range(1, ${n} + 1):`;
      wrong = [`for i in range(${n}):`, `for i in range(1, ${n} - 1):`, `for i in range(0, ${n}):`];
      output = String((n * (n + 1)) / 2);
      hint = { nl: `De som van 1 t/m ${n} is ${output}. Doet ${n} nu mee?`, en: `The sum of 1 to ${n} is ${output}. Is ${n} included right now?` };
    } else if (scenario === 1) {
      const name = rng.pick(LIST_NAMES);
      const nums = distinctInts(rng, 4, 1, 20);
      codeLines = [`${name} = ${pyRepr(nums)}`, `for i in range(len(${name}) + 1):`, `    print(${name}[i], end=" ")`];
      bugLine = 2;
      fix = `for i in range(len(${name})):`;
      wrong = [`for i in range(1, len(${name}) + 1):`, `for i in range(len(${name}) - 1):`, `for i in range(1, len(${name})):`];
      output = nums.join(' ');
      hint = { nl: `De lijst heeft ${nums.length} elementen, dus de laatste index is ${nums.length - 1}.`, en: `The list has ${nums.length} elements, so the last index is ${nums.length - 1}.` };
    } else {
      const name = rng.pick(LIST_NAMES);
      const nums = distinctInts(rng, 5, 1, 50);
      const max = Math.max(...nums);
      // If the maximum came first, `if n == best:` would accidentally give the right output.
      if (nums[0] === max) [nums[0], nums[4]] = [nums[4], nums[0]];
      codeLines = [`${name} = ${pyRepr(nums)}`, `best = ${name}[0]`, `for n in ${name}:`, '    if n < best:', '        best = n', 'print(best)'];
      bugLine = 4;
      fix = 'if n > best:';
      wrong = ['if n <= best:', 'if n == best:', 'if best > n:'];
      output = String(max);
      hint = { nl: 'De code zoekt nu het kleinste getal in plaats van het grootste.', en: 'Right now the code finds the smallest number instead of the largest.' };
    }
    const code = lines(...codeLines);
    const fixed = [...codeLines];
    fixed[bugLine - 1] = (codeLines[bugLine - 1].match(/^\s*/)?.[0] ?? '') + fix;
    return {
      code,
      prompt: promptFix(output, bugLine),
      highlightLine: bugLine,
      choices: makeChoices(rng, fix, wrong),
      answer: fix,
      hints: [
        { nl: 'Loop de code stap voor stap door met de gegeven waarden.', en: 'Step through the code with the given values.' },
        hint,
        { nl: 'Probeer elke optie in gedachten: welke geeft precies de gevraagde output?', en: 'Try each option mentally: which gives exactly the requested output?' },
      ],
      verify: { code: lines(...fixed), output },
    };
  },
};

const nestedIf: Template = {
  id: 'medium-nested-if',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const [p, q] = rng.pick([['x', 'y'], ['a', 'b'], ['hp', 'xp'], ['width', 'height']]);
    const x = rng.int(1, 15), y = rng.int(1, 15);
    const t1 = x + rng.pick([-2, -1, 1, 2]);
    const inner = rng.chance(0.5)
      ? { src: `${q} % 2 == 0`, ok: y % 2 === 0 }
      : (() => { const t2 = y + rng.pick([-3, 3]); return { src: `${q} < ${t2}`, ok: y < t2 }; })();
    const labels = rng.pick([['red', 'green', 'blue'], ['north', 'east', 'west'], ['cat', 'dog', 'fox'], ['low', 'mid', 'top']]);
    const outer = x > t1;
    const answer = outer ? (inner.ok ? labels[0] : labels[1]) : labels[2];
    const code = lines(
      `${p} = ${x}`, `${q} = ${y}`, `if ${p} > ${t1}:`, `    if ${inner.src}:`, `        print("${labels[0]}")`,
      '    else:', `        print("${labels[1]}")`, 'else:', `    print("${labels[2]}")`,
    );
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, labels, 3),
      answer,
      hints: [
        { nl: 'De binnenste if wordt alleen bekeken als de buitenste voorwaarde waar is.', en: 'The inner if is only checked when the outer condition is true.' },
        { nl: 'Let op de inspringing: die bepaalt bij welke if een else hoort.', en: 'Watch the indentation: it decides which if an else belongs to.' },
        { nl: `Is ${x} > ${t1}? ${outer ? 'Ja.' : 'Nee.'}`, en: `Is ${x} > ${t1}? ${outer ? 'Yes.' : 'No.'}` },
      ],
      verify: { code, output: answer },
    };
  },
};

const dictUpdate: Template = {
  id: 'medium-dict',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const d = rng.pick(['stock', 'fruit', 'basket', 'inventory']);
    const [k1, k2, k3] = rng.sample(['apple', 'pear', 'kiwi', 'mango', 'plum', 'lime'], 3);
    const a = rng.int(1, 9), b = rng.int(2, 9), add = rng.int(1, 5), c = rng.int(1, 9), sub = rng.int(1, 2);
    const dict: Record<string, number> = { [k1]: a + add, [k2]: b - sub, [k3]: c };
    const variant = rng.int(0, 2);
    const [expr, answer] =
      variant === 0 ? [`${d}["${k1}"] + len(${d})`, dict[k1] + 3]
        : variant === 1 ? [`sum(${d}.values())`, dict[k1] + dict[k2] + dict[k3]]
          : [`${d}.get("banana", 0) + ${d}["${k2}"]`, dict[k2]];
    const code = lines(
      `${d} = {"${k1}": ${a}, "${k2}": ${b}}`, `${d}["${k1}"] += ${add}`, `${d}["${k2}"] -= ${sub}`, `${d}["${k3}"] = ${c}`, `print(${expr})`,
    );
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: String(answer),
      hints: [
        { nl: 'Een dictionary koppelt keys aan waarden; `d["key"] = ...` voegt een nieuwe key toe of overschrijft.', en: 'A dictionary maps keys to values; `d["key"] = ...` adds a new key or overwrites.' },
        { nl: '`.get(key, 0)` geeft 0 als de key niet bestaat, zonder foutmelding.', en: "`.get(key, 0)` gives 0 if the key doesn't exist, without an error." },
        { nl: `Aan het eind: ${k1} = ${dict[k1]}, ${k2} = ${dict[k2]}, ${k3} = ${dict[k3]}.`, en: `At the end: ${k1} = ${dict[k1]}, ${k2} = ${dict[k2]}, ${k3} = ${dict[k3]}.` },
      ],
      verify: { code, output: String(answer) },
    };
  },
};

const countLetters: Template = {
  id: 'medium-count-letters',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    const word = rng.pick(WORDS);
    const v = rng.pick(['word', 'text', 'name']);
    const variant = rng.int(0, 2);
    const set = variant === 0 ? 'aeiou' : rng.sample([...new Set(word)], Math.min(3, new Set(word).size)).join('');
    const letter = rng.pick([...word]);
    const cond = variant === 2 ? `ch != "${letter}"` : `ch in "${set}"`;
    const count = [...word].filter((ch) => (variant === 2 ? ch !== letter : set.includes(ch))).length;
    const code = lines(`${v} = "${word}"`, 'count = 0', `for ch in ${v}:`, `    if ${cond}:`, '        count += 1', 'print(count)');
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: String(count),
      hints: [
        { nl: 'De lus bekijkt elke letter van de string één voor één.', en: 'The loop looks at every letter of the string, one by one.' },
        variant === 2
          ? { nl: `\`!=\` betekent "is niet": tel alle letters behalve "${letter}".`, en: `\`!=\` means "is not": count every letter except "${letter}".` }
          : { nl: `\`ch in "${set}"\` is waar als de letter één van ${[...set].join(', ')} is.`, en: `\`ch in "${set}"\` is true if the letter is one of ${[...set].join(', ')}.` },
        { nl: `"${word}" heeft ${word.length} letters.`, en: `"${word}" has ${word.length} letters.` },
      ],
      verify: { code, output: String(count) },
    };
  },
};

const whileBreak: Template = {
  id: 'medium-while-break',
  difficulty: 'medium',
  type: 'predict',
  generate(rng) {
    let code: string, answer: string, hint: Loc;
    if (rng.chance(0.5)) {
      const t = rng.int(10, 40);
      let n = 0, total = 0;
      while (true) { n++; total += n; if (total > t) break; }
      code = lines('n = 0', 'total = 0', 'while True:', '    n += 1', '    total += n', `    if total > ${t}:`, '        break', 'print(n, total)');
      answer = `${n} ${total}`;
      hint = { nl: `total wordt 1, 3, 6, 10, ...; de lus stopt zodra total groter is dan ${t}.`, en: `total becomes 1, 3, 6, 10, ...; the loop stops once total exceeds ${t}.` };
    } else {
      const t = rng.int(10, 60);
      let i = 1;
      while (i * i <= t) i++;
      code = lines('for i in range(1, 20):', `    if i * i > ${t}:`, '        break', 'print(i)');
      answer = String(i);
      hint = { nl: `Zoek het eerste getal waarvan het kwadraat groter is dan ${t}.`, en: `Find the first number whose square is greater than ${t}.` };
    }
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: '`break` stopt de lus meteen; de code na de lus gaat gewoon verder.', en: '`break` stops the loop right away; the code after the loop carries on.' },
        { nl: 'Na de lus houdt de variabele de waarde die hij had bij de break.', en: 'After the loop, the variable keeps the value it had at the break.' },
        hint,
      ],
      verify: { code, output: answer },
    };
  },
};

export const mediumTemplates: Template[] = [
  nestedIf, dictUpdate, countLetters, whileBreak,
  loopSum, listSlice, whileLoop, functions, moduloLoop, listMethods, stringMethods, fillRange, fixLoop,
];
