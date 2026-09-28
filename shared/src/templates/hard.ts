import type { Loc, Template } from '../types';
import {
  LIST_NAMES, PEOPLE, PROMPT_PREDICT, WORDS, floorDiv, lines, makeChoices, promptFill, promptFix,
  pyRepr,
} from '../py';

const TYPED_HINT: Loc = {
  nl: 'Meerdere waarden? Typ ze gewoon achter elkaar met spaties.',
  en: 'Multiple values? Just type them separated by spaces.',
};

const nestedLoops: Template = {
  id: 'hard-nested-loops',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const a = rng.int(3, 5), b = rng.int(4, 6), k = rng.int(2, 3);
    const inner = rng.pick([
      { src: `range(i, ${b})`, lo: (i: number) => i },
      { src: `range(i + 1, ${b})`, lo: (i: number) => i + 1 },
      { src: `range(${b})`, lo: () => 0 },
    ]);
    const cond = rng.pick([
      { src: `(i + j) % ${k} == 0`, f: (i: number, j: number) => (i + j) % k === 0 },
      { src: `i * j > ${k + 2}`, f: (i: number, j: number) => i * j > k + 2 },
      { src: `j - i == ${k - 1}`, f: (i: number, j: number) => j - i === k - 1 },
    ]);
    let count = 0, firstI = 0;
    const perI: number[] = [];
    for (let i = 0; i < a; i++) {
      let c = 0;
      for (let j = inner.lo(i); j < b; j++) if (cond.f(i, j)) c++;
      perI.push(c);
      count += c;
      if (i === 0) firstI = c;
    }
    const code = lines(
      'count = 0', `for i in range(${a}):`, `    for j in ${inner.src}:`, `        if ${cond.src}:`,
      '            count += 1', 'print(count)',
    );
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: String(count),
      hints: [
        { nl: 'Voor elke waarde van i loopt de binnenste lus volledig.', en: 'For every value of i, the inner loop runs completely.' },
        { nl: `Voor i = 0 telt de binnenste lus ${firstI} keer mee.`, en: `For i = 0 the inner loop counts ${firstI} time(s).` },
        { nl: `Per i: ${perI.join(', ')}. Tel ze op.`, en: `Per i: ${perI.join(', ')}. Add them up.` },
      ],
      verify: { code, output: String(count) },
    };
  },
};

const dictCount: Template = {
  id: 'hard-dict-count',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const letters = rng.sample(['a', 'b', 'c', 'd', 'e', 'k', 'o', 'x'], rng.int(3, 4));
    const text = Array.from({ length: rng.int(8, 11) }, () => rng.pick(letters)).join('');
    const counts = new Map<string, number>();
    for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    let best = '', bestN = -1;
    for (const [ch, n] of counts) if (n > bestN) { best = ch; bestN = n; }
    const probe = rng.pick([...counts.keys()]);
    const variant = rng.int(0, 2);
    const expr = variant === 0 ? `counts["${probe}"]` : variant === 1 ? 'len(counts)' : 'max(counts, key=counts.get)';
    const answer = variant === 0 ? String(counts.get(probe)) : variant === 1 ? String(counts.size) : best;
    const code = lines(
      `text = "${text}"`, 'counts = {}', 'for ch in text:', '    counts[ch] = counts.get(ch, 0) + 1', `print(${expr})`,
    );
    const hint3: Loc =
      variant === 0 ? { nl: `Tel hoe vaak "${probe}" in "${text}" staat.`, en: `Count how often "${probe}" appears in "${text}".` }
        : variant === 1 ? { nl: 'len van een dictionary is het aantal verschillende keys.', en: 'len of a dictionary is the number of distinct keys.' }
          : { nl: '`max(..., key=counts.get)` geeft de key met de hoogste telling (bij gelijkspel: de eerste).', en: '`max(..., key=counts.get)` returns the key with the highest count (on a tie: the first one).' };
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: 'De dictionary telt hoe vaak elke letter voorkomt.', en: 'The dictionary counts how often each letter occurs.' },
        { nl: '`counts.get(ch, 0)` geeft 0 als de letter nog niet in de dictionary staat.', en: "`counts.get(ch, 0)` gives 0 if the letter isn't in the dictionary yet." },
        hint3,
      ],
      verify: { code, output: answer },
    };
  },
};

const comprehension: Template = {
  id: 'hard-comprehension',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const n = rng.int(6, 10), k = rng.int(2, 4), m = rng.int(2, 3), r = rng.int(0, m - 1), t = rng.int(2, 5);
    const map = rng.pick([
      { src: `x * ${k}`, f: (x: number) => x * k },
      { src: 'x ** 2', f: (x: number) => x * x },
      { src: `x + ${k}`, f: (x: number) => x + k },
      { src: `x // ${k}`, f: (x: number) => floorDiv(x, k) },
    ]);
    const cond = rng.pick([
      { src: `x % ${m} == ${r}`, f: (x: number) => x % m === r },
      { src: `x > ${t}`, f: (x: number) => x > t },
      { src: `x % ${m} != 0`, f: (x: number) => x % m !== 0 },
    ]);
    const xs = Array.from({ length: n }, (_, i) => i).filter(cond.f);
    const result = xs.map(map.f);
    const answer = pyRepr(result);
    const code = lines(`result = [${map.src} for x in range(${n}) if ${cond.src}]`, 'print(result)');
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: 'Lees het als: voor elke x in range, als de voorwaarde klopt, bereken dan de expressie.', en: 'Read it as: for each x in the range, if the condition holds, compute the expression.' },
        { nl: `De x-waarden die door het filter komen: ${xs.join(', ') || '(geen)'}.`, en: `The x values that pass the filter: ${xs.join(', ') || '(none)'}.` },
        { nl: 'Typ het resultaat als lijst, bijvoorbeeld [1, 2, 3].', en: 'Type the result as a list, for example [1, 2, 3].' },
      ],
      verify: { code, output: answer },
    };
  },
};

const recursion: Template = {
  id: 'hard-recursion',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const fname = rng.pick(['f', 'mystery', 'solve', 'walk']);
    const variants: (() => { body: string[]; arg: string; answer: string; trace: Loc })[] = [
      () => {
        const n = rng.int(3, 6);
        let v = 1; for (let i = 2; i <= n; i++) v *= i;
        return {
          body: ['    if n <= 1:', '        return 1', `    return n * ${fname}(n - 1)`], arg: String(n), answer: String(v),
          trace: { nl: `${fname}(${n}) = ${Array.from({ length: n }, (_, i) => n - i).join(' × ')}`, en: `${fname}(${n}) = ${Array.from({ length: n }, (_, i) => n - i).join(' × ')}` },
        };
      },
      () => {
        const n = rng.int(3, 6), base = rng.int(1, 5);
        const v = base + (n * (n + 1)) / 2;
        return {
          body: ['    if n == 0:', `        return ${base}`, `    return ${fname}(n - 1) + n`], arg: String(n), answer: String(v),
          trace: { nl: `${fname}(${n}) = ${base} + 1 + ... + ${n}`, en: `${fname}(${n}) = ${base} + 1 + ... + ${n}` },
        };
      },
      () => {
        const n = rng.int(5, 9);
        const fib = [0, 1]; for (let i = 2; i <= n; i++) fib.push(fib[i - 1] + fib[i - 2]);
        return {
          body: ['    if n < 2:', '        return n', `    return ${fname}(n - 1) + ${fname}(n - 2)`], arg: String(n), answer: String(fib[n]),
          trace: { nl: `De reeks begint met ${fib.slice(0, 5).join(', ')}, ...`, en: `The sequence starts ${fib.slice(0, 5).join(', ')}, ...` },
        };
      },
      () => {
        const n = rng.int(10, 30), d = rng.int(3, 5);
        let v = 0, x = n; while (x > 0) { x -= d; v++; }
        return {
          body: ['    if n <= 0:', '        return 0', `    return ${fname}(n - ${d}) + 1`], arg: String(n), answer: String(v),
          trace: { nl: `Hoe vaak kun je ${d} van ${n} aftrekken voordat je op 0 of lager komt?`, en: `How many times can you subtract ${d} from ${n} before reaching 0 or below?` },
        };
      },
      () => {
        const w = rng.pick(WORDS).slice(0, 5);
        return {
          body: ['    if len(n) == 0:', '        return ""', `    return ${fname}(n[1:]) + n[0]`], arg: `"${w}"`, answer: [...w].reverse().join(''),
          trace: { nl: 'De eerste letter wordt steeds achteraan geplakt, na de rest.', en: 'The first letter is always added at the end, after the rest.' },
        };
      },
    ];
    const v = rng.pick(variants)();
    const code = lines(`def ${fname}(n):`, ...v.body, '', `print(${fname}(${v.arg}))`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: v.answer,
      hints: [
        { nl: 'Een recursieve functie roept zichzelf aan met een kleinere invoer, tot de basisgeval-regel.', en: 'A recursive function calls itself with a smaller input until it hits the base case.' },
        { nl: 'Begin bij het basisgeval en werk terug omhoog.', en: 'Start from the base case and work your way back up.' },
        v.trace,
      ],
      verify: { code, output: v.answer },
    };
  },
};

const stringChain: Template = {
  id: 'hard-string-chain',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const words = rng.sample(WORDS, 3);
    const sentence = words.join(' ');
    const k = rng.int(0, 2);
    const letter = rng.pick([...new Set(sentence.replace(/ /g, ''))]);
    const variants = [
      {
        expr: '"-".join(w[::-1] for w in sentence.split())', ans: words.map((w) => [...w].reverse().join('')).join('-'),
        hint: { nl: 'Elk woord wordt omgedraaid, daarna aan elkaar geplakt met "-".', en: 'Each word is reversed, then joined with "-".' },
      },
      {
        expr: `sentence.split()[${k}].upper()`, ans: words[k].toUpperCase(),
        hint: { nl: `split() maakt de lijst ${pyRepr(words)}.`, en: `split() produces the list ${pyRepr(words)}.` },
      },
      {
        expr: `len(sentence.split()), sentence.count("${letter}")`, ans: `3 ${sentence.split(letter).length - 1}`,
        hint: { nl: `Tel hoe vaak "${letter}" in de hele zin voorkomt.`, en: `Count how often "${letter}" appears in the whole sentence.` },
      },
      {
        expr: '"".join(w[0] for w in sentence.split()).upper()', ans: words.map((w) => w[0]).join('').toUpperCase(),
        hint: { nl: 'Van elk woord de eerste letter, daarna alles hoofdletters.', en: 'The first letter of each word, then all uppercase.' },
      },
      {
        expr: 'sentence.title().replace(" ", "")', ans: words.map((w) => w[0].toUpperCase() + w.slice(1)).join(''),
        hint: { nl: '`title()` maakt van elke eerste letter van een woord een hoofdletter.', en: '`title()` capitalizes the first letter of each word.' },
      },
    ];
    const v = rng.pick(variants);
    const code = lines(`sentence = "${sentence}"`, `print(${v.expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: v.ans,
      hints: [
        { nl: 'Werk de methodes van links naar rechts af.', en: 'Work through the methods from left to right.' },
        v.expr.includes(',') ? TYPED_HINT : { nl: '`split()` knipt de zin op spaties in een lijst woorden.', en: '`split()` cuts the sentence on spaces into a list of words.' },
        v.hint,
      ],
      verify: { code, output: v.ans },
    };
  },
};

const aliasing: Template = {
  id: 'hard-aliasing',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const start = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], rng.int(2, 3));
    const copyExpr = rng.pick(['a[:]', 'list(a)', 'a.copy()']);
    const env: Record<'a' | 'b' | 'c', number[]> = { a: [...start], b: [], c: [...start] };
    env.b = env.a; // alias
    const opsSrc: string[] = [];
    const ops = rng.shuffle([
      () => { const x = rng.int(10, 20); opsSrc.push(`b.append(${x})`); env.b.push(x); },
      () => { const x = rng.int(21, 30); opsSrc.push(`c.append(${x})`); env.c.push(x); },
      rng.chance(0.5)
        ? () => { const x = rng.int(31, 40); opsSrc.push(`b = b + [${x}]`); env.b = [...env.b, x]; }
        : () => { const x = rng.int(31, 40); opsSrc.push(`b += [${x}]`); env.b.push(x); },
    ]);
    ops.forEach((op) => op());
    const printLens = rng.chance(0.5);
    const expr = printLens ? 'len(a), len(b), len(c)' : 'a';
    const answer = printLens ? `${env.a.length} ${env.b.length} ${env.c.length}` : pyRepr(env.a);
    const code = lines(`a = ${pyRepr(start)}`, 'b = a', `c = ${copyExpr}`, ...opsSrc, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: '`b = a` maakt géén kopie: a en b wijzen naar dezelfde lijst.', en: "`b = a` does not copy: a and b point to the same list." },
        { nl: `\`c = ${copyExpr}\` maakt wél een nieuwe, losse kopie.`, en: `\`c = ${copyExpr}\` does make a new, separate copy.` },
        { nl: '`b += [x]` verandert de lijst zelf, maar `b = b + [x]` maakt een nieuwe lijst en koppelt b los van a.', en: '`b += [x]` changes the list itself, but `b = b + [x]` creates a new list and detaches b from a.' },
      ],
      verify: { code, output: answer },
    };
  },
};

const collatz: Template = {
  id: 'hard-collatz',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    // Starting values whose sequence is short enough to trace by hand.
    const n = rng.pick([5, 6, 8, 10, 12, 13, 16, 20, 21, 24, 32, 40, 64]);
    let x = n, steps = 0, highest = n;
    const trail = [n];
    while (x !== 1) { x = x % 2 === 0 ? x / 2 : 3 * x + 1; steps++; highest = Math.max(highest, x); trail.push(x); }
    const both = rng.chance(0.5);
    const answer = both ? `${steps} ${highest}` : String(steps);
    const code = lines(
      `n = ${n}`, 'steps = 0', 'highest = n', 'while n != 1:', '    if n % 2 == 0:', '        n = n // 2', '    else:',
      '        n = 3 * n + 1', '    steps += 1', '    highest = max(highest, n)', both ? 'print(steps, highest)' : 'print(steps)',
    );
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: 'Even getal: halveren. Oneven getal: keer 3 plus 1. Stop bij 1.', en: 'Even number: halve it. Odd number: times 3 plus 1. Stop at 1.' },
        { nl: `De eerste stappen: ${trail.slice(0, 4).join(' → ')} → ...`, en: `The first steps: ${trail.slice(0, 4).join(' → ')} → ...` },
        { nl: `Volledige reeks: ${trail.join(' → ')}`, en: `Full sequence: ${trail.join(' → ')}` },
      ],
      verify: { code, output: answer },
    };
  },
};

const fixLogic: Template = {
  id: 'hard-fix-logic',
  difficulty: 'hard',
  type: 'fixbug',
  generate(rng) {
    const scenario = rng.int(0, 2);
    let codeLines: string[], bugLine: number, fix: string, wrong: string[], output: string, hint: Loc;
    if (scenario === 0) {
      const nums = rng.sample([-2, -3, -4, -5, -6, -7, -8, -9, -11, -12], 4);
      codeLines = ['def biggest(nums):', '    best = 0', '    for n in nums:', '        if n > best:', '            best = n', '    return best', '', `print(biggest(${pyRepr(nums)}))`];
      bugLine = 2;
      fix = 'best = nums[0]';
      wrong = ['best = -1', 'best = None', 'best = 0.0'];
      output = String(Math.max(...nums));
      hint = { nl: 'Alle getallen zijn negatief. Wordt best ooit aangepast als hij op 0 begint?', en: 'All numbers are negative. Does best ever change if it starts at 0?' };
    } else if (scenario === 1) {
      const word = rng.pick(WORDS).slice(0, 6);
      codeLines = [`word = "${word}"`, 'result = ""', 'for ch in word:', '    result = result + ch', 'print(result)'];
      bugLine = 4;
      fix = 'result = ch + result';
      wrong = ['result += ch', 'result = ch + ch', 'result = result + ch[::-1]'];
      output = [...word].reverse().join('');
      hint = { nl: 'De code bouwt het woord nu in dezelfde volgorde op. Waar moet elke nieuwe letter komen?', en: 'The code now builds the word in the same order. Where should each new letter go?' };
    } else {
      const name = rng.pick(LIST_NAMES);
      // Never 3 evens out of 6: then the buggy odd-count would print the same number.
      const evens = rng.pick([1, 2, 4, 5]);
      const nums = rng.shuffle([
        ...rng.sample([2, 4, 6, 8, 10, 12, 14, 16], evens),
        ...rng.sample([3, 5, 7, 9, 11, 13, 15, 17], 6 - evens),
      ]);
      codeLines = [`${name} = ${pyRepr(nums)}`, 'evens = 0', `for n in ${name}:`, '    if n % 2 == 1:', '        evens += 1', 'print(evens)'];
      bugLine = 4;
      fix = 'if n % 2 == 0:';
      wrong = ['if n / 2 == 0:', 'if n // 2 == 0:', 'if n % 2 == 2:'];
      output = String(evens);
      hint = { nl: 'Een getal is even als de rest na delen door 2 gelijk is aan 0.', en: 'A number is even when the remainder after dividing by 2 is 0.' };
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
        { nl: 'De code is geldige Python, maar de logica klopt niet.', en: 'The code is valid Python, but the logic is wrong.' },
        hint,
        { nl: 'Loop de code met de juiste optie in gedachten na.', en: 'Trace the code in your head with each option.' },
      ],
      verify: { code: lines(...fixed), output },
    };
  },
};

const fillComprehension: Template = {
  id: 'hard-fill-comprehension',
  difficulty: 'hard',
  type: 'fillblank',
  generate(rng) {
    const name = rng.pick(LIST_NAMES);
    const nums = rng.sample([1, 2, 3, 4, 5, 6, 7, 8, 9], 4);
    const exprs = [
      { src: 'x * 2', f: (x: number) => x * 2 },
      { src: 'x ** 2', f: (x: number) => x * x },
      { src: 'x + 2', f: (x: number) => x + 2 },
      { src: 'x % 2', f: (x: number) => x % 2 },
      { src: 'x // 2', f: (x: number) => floorDiv(x, 2) },
      { src: '-x', f: (x: number) => -x },
      { src: 'x - 1', f: (x: number) => x - 1 },
    ];
    const correct = rng.pick(exprs);
    const output = pyRepr(nums.map(correct.f));
    const wrong = rng.shuffle(exprs.filter((e) => e !== correct && pyRepr(nums.map(e.f)) !== output)).map((e) => e.src);
    const code = lines(`${name} = ${pyRepr(nums)}`, `result = [___ for x in ${name}]`, 'print(result)');
    return {
      code,
      prompt: promptFill(output),
      choices: makeChoices(rng, correct.src, wrong),
      answer: correct.src,
      hints: [
        { nl: 'De expressie op de lege plek wordt op elk element x toegepast.', en: 'The expression in the blank is applied to every element x.' },
        { nl: `Kijk naar het eerste element: ${nums[0]} wordt ${correct.f(nums[0])}.`, en: `Look at the first element: ${nums[0]} becomes ${correct.f(nums[0])}.` },
        { nl: 'Controleer je keuze ook op de andere elementen.', en: 'Check your choice against the other elements too.' },
      ],
      verify: { code: code.replace('___', correct.src), output },
    };
  },
};

const enumerateZip: Template = {
  id: 'hard-enumerate-zip',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const people = rng.sample(PEOPLE, 4);
    const scores = people.map(() => rng.int(1, 9));
    const t = rng.int(3, 6);
    const cond = rng.pick([
      { src: 'i % 2 == 0', f: (i: number) => i % 2 === 0, hint: { nl: 'Alleen index 0 en 2 tellen mee.', en: 'Only index 0 and 2 count.' } },
      { src: 'len(name) > 4', f: (i: number) => people[i].length > 4, hint: { nl: 'Alleen namen met meer dan 4 letters tellen mee.', en: 'Only names with more than 4 letters count.' } },
      { src: `score > ${t} or i == 0`, f: (i: number) => scores[i] > t || i === 0, hint: { nl: `De eerste telt altijd mee, de rest alleen als de score groter is dan ${t}.`, en: `The first always counts, the rest only if the score is greater than ${t}.` } },
    ]);
    const total = scores.reduce((s, v, i) => s + (cond.f(i) ? v : 0), 0);
    const code = lines(
      `names = ${pyRepr(people)}`, `scores = ${pyRepr(scores)}`, 'total = 0',
      'for i, (name, score) in enumerate(zip(names, scores)):', `    if ${cond.src}:`, '        total += score', 'print(total)',
    );
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: String(total),
      hints: [
        { nl: '`zip` koppelt de twee lijsten paarsgewijs; `enumerate` geeft er een index i bij (vanaf 0).', en: '`zip` pairs the two lists; `enumerate` adds an index i (starting at 0).' },
        { nl: `De eerste ronde is i = 0, name = "${people[0]}", score = ${scores[0]}.`, en: `The first round is i = 0, name = "${people[0]}", score = ${scores[0]}.` },
        cond.hint,
      ],
      verify: { code, output: String(total) },
    };
  },
};

const sets: Template = {
  id: 'hard-sets',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const [p, q] = rng.pick([['a', 'b'], ['mine', 'yours'], ['team_a', 'team_b'], ['left', 'right']]);
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const a = rng.sample(digits, rng.int(4, 5)).sort((x, y) => x - y);
    const b = rng.sample(digits, rng.int(3, 4)).sort((x, y) => x - y);
    const union = new Set([...a, ...b]).size;
    const both = a.filter((x) => b.includes(x));
    const onlyA = a.filter((x) => !b.includes(x));
    const lensVariant = rng.chance(0.5);
    const expr = lensVariant ? `len(${p} | ${q}), len(${p} & ${q}), len(${p} - ${q})` : `sorted(${p} - ${q})`;
    const answer = lensVariant ? `${union} ${both.length} ${onlyA.length}` : pyRepr(onlyA);
    const setSrc = (xs: number[]) => `{${xs.join(', ')}}`;
    const code = lines(`${p} = ${setSrc(a)}`, `${q} = ${setSrc(b)}`, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: 'Een set bevat elke waarde maar één keer.', en: 'A set contains each value only once.' },
        { nl: '`|` is alles uit beide sets, `&` wat in allebei zit, `-` wat alleen in de eerste zit.', en: '`|` is everything from both, `&` what is in both, `-` what is only in the first.' },
        { nl: `In allebei: ${both.join(', ') || 'niets'}.`, en: `In both: ${both.join(', ') || 'nothing'}.` },
      ],
      verify: { code, output: answer },
    };
  },
};

const sortedKey: Template = {
  id: 'hard-sorted-key',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const name = rng.pick(['words', 'fruits', 'names']);
    const words = rng.sample(['kiwi', 'fig', 'banana', 'plum', 'cherry', 'apple', 'lime', 'mango', 'pear', 'grape'], 4);
    const firstBy = (better: (a: string, b: string) => boolean) => words.reduce((best, w) => (better(w, best) ? w : best));
    const shortest = firstBy((a, b) => a.length < b.length);
    const longest = firstBy((a, b) => a.length > b.length);
    const alpha = [...words].sort();
    const variant = rng.int(0, 2);
    const [expr, answer, hint]: [string, string, Loc] =
      variant === 0
        ? [`sorted(${name}, key=len)[0], max(${name}, key=len)`, `${shortest} ${longest}`,
          { nl: 'Bij gelijke lengte blijft de oorspronkelijke volgorde behouden; `max` geeft de eerste langste.', en: 'Equal lengths keep their original order; `max` returns the first longest.' }]
        : variant === 1
          ? [`sorted(${name})[-1], min(${name})`, `${alpha[alpha.length - 1]} ${alpha[0]}`,
            { nl: 'Zonder key sorteert Python strings alfabetisch.', en: 'Without a key, Python sorts strings alphabetically.' }]
          : [`sorted(${name}, key=len, reverse=True)[0]`, longest,
            { nl: 'reverse=True zet de langste vooraan; bij gelijke lengte blijft de volgorde van de lijst.', en: 'reverse=True puts the longest first; equal lengths keep the list order.' }];
    const code = lines(`${name} = ${pyRepr(words)}`, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer,
      hints: [
        { nl: '`key=len` betekent: vergelijk op lengte in plaats van alfabetisch.', en: '`key=len` means: compare by length instead of alphabetically.' },
        { nl: `Lengtes: ${words.map((w) => `${w}=${w.length}`).join(', ')}.`, en: `Lengths: ${words.map((w) => `${w}=${w.length}`).join(', ')}.` },
        hint,
      ],
      verify: { code, output: answer },
    };
  },
};

const enumerateBuild: Template = {
  id: 'hard-enumerate-build',
  difficulty: 'hard',
  type: 'predict',
  generate(rng) {
    const word = rng.pick(WORDS.filter((w) => w.length >= 4 && w.length <= 7));
    const v = rng.pick(['word', 'text', 'code']);
    const r = rng.int(0, 1), k = rng.int(2, 4);
    const cond = rng.chance(0.5) ? { src: `i % 2 == ${r}`, f: (i: number) => i % 2 === r } : { src: `i < ${k}`, f: (i: number) => i < k };
    const then = rng.pick([{ src: 'ch.upper()', f: (c: string) => c.toUpperCase() }, { src: 'ch * 2', f: (c: string) => c + c }]);
    const other = rng.pick([{ src: 'ch', f: (c: string) => c }, { src: '"-"', f: () => '-' }]);
    const result = [...word].map((c, i) => (cond.f(i) ? then.f(c) : other.f(c))).join('');
    const code = lines(
      `${v} = "${word}"`, 'result = ""', `for i, ch in enumerate(${v}):`, `    if ${cond.src}:`, `        result += ${then.src}`, '    else:',
      `        result += ${other.src}`, 'print(result)',
    );
    return {
      code,
      prompt: PROMPT_PREDICT,
      answer: result,
      hints: [
        { nl: '`enumerate` geeft bij elke letter ook de index i, beginnend bij 0.', en: '`enumerate` gives the index i with every letter, starting at 0.' },
        { nl: `De eerste ronde: i = 0, ch = "${word[0]}".`, en: `The first round: i = 0, ch = "${word[0]}".` },
        { nl: `Het resultaat begint met "${result.slice(0, 3)}".`, en: `The result starts with "${result.slice(0, 3)}".` },
      ],
      verify: { code, output: result },
    };
  },
};

const fixLoops: Template = {
  id: 'hard-fix-loops',
  difficulty: 'hard',
  type: 'fixbug',
  generate(rng) {
    let codeLines: string[], bugLine: number, fix: string, wrong: string[], output: string, hint: Loc;
    if (rng.chance(0.5)) {
      const palins = rng.sample(['level', 'radar', 'kayak', 'noon', 'refer', 'civic', 'rotor'], rng.int(1, 2));
      const sameEnds = rng.sample(['that', 'dread', 'gong', 'test', 'area', 'noun'], 1);
      const others = rng.sample(['python', 'code', 'robot', 'pixel', 'cloud', 'laptop'], 3 - palins.length);
      const words = rng.shuffle([...palins, ...sameEnds, ...others]);
      codeLines = [`words = ${pyRepr(words)}`, 'count = 0', 'for w in words:', '    if w == w[::1]:', '        count += 1', 'print(count)'];
      bugLine = 4;
      fix = 'if w == w[::-1]:';
      wrong = ['if w == w[::1]:', 'if w[0] == w[-1]:', 'if w == w[-1]:'];
      output = String(palins.length);
      hint = { nl: 'De code moet palindromen tellen: woorden die achterstevoren hetzelfde zijn.', en: 'The code should count palindromes: words that read the same backwards.' };
    } else {
      const name = rng.pick(LIST_NAMES);
      let nums: number[];
      const sumAt = (xs: number[], start: number) => xs.filter((_, i) => i >= start && (i - start) % 2 === 0).reduce((a, b) => a + b, 0);
      do nums = rng.sample(Array.from({ length: 20 }, (_, i) => i + 1), 6);
      while (sumAt(nums, 0) === sumAt(nums, 1));
      codeLines = [`${name} = ${pyRepr(nums)}`, 'total = 0', `for i in range(1, len(${name}), 2):`, `    total += ${name}[i]`, 'print(total)'];
      bugLine = 3;
      fix = `for i in range(0, len(${name}), 2):`;
      wrong = [`for i in range(1, len(${name}), 2):`, `for i in range(len(${name})):`, `for i in range(2, len(${name}), 2):`];
      output = String(sumAt(nums, 0));
      hint = { nl: 'De code moet de getallen op index 0, 2, 4 optellen. Waar begint de lus nu?', en: 'The code should add the numbers at index 0, 2, 4. Where does the loop start now?' };
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
        { nl: 'De code draait zonder foutmelding, maar geeft het verkeerde antwoord.', en: 'The code runs without errors, but gives the wrong answer.' },
        hint,
        { nl: 'Probeer elke optie op de eerste twee elementen.', en: 'Try each option on the first two elements.' },
      ],
      verify: { code: lines(...fixed), output },
    };
  },
};

export const hardTemplates: Template[] = [
  sets, sortedKey, enumerateBuild, fixLoops,
  nestedLoops, dictCount, comprehension, recursion, stringChain, aliasing, collatz, fixLogic, fillComprehension, enumerateZip,
];
