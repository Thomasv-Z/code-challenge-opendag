import type { Loc, Template } from '../types';
import {
  PEOPLE, PROMPT_PREDICT, VAR_NAMES, WORDS, floorDiv, lines, makeChoices,
  numberNeighbors, promptFill, promptFix, pyFloat, pyMod, pyRepr,
} from '../py';

type Op = '+' | '-' | '*';
const apply = (a: number, op: Op, b: number) => (op === '+' ? a + b : op === '-' ? a - b : a * b);

const precedence: Template = {
  id: 'easy-precedence',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const [p, q, r] = rng.sample(['a', 'b', 'c', 'x', 'y', 'z', 'n', 'm'], 3);
    const a = rng.int(2, 9), b = rng.int(2, 9), c = rng.int(2, 6);
    const variant = rng.int(0, 2);
    let expr: string, answer: number, wrong: number[], first: string;
    if (variant === 0) {
      expr = `${p} + ${q} * ${r}`;
      answer = a + b * c;
      wrong = [(a + b) * c, a * b + c, a + b + c];
      first = `${q} * ${r} = ${b * c}`;
    } else if (variant === 1) {
      expr = `(${p} + ${q}) * ${r}`;
      answer = (a + b) * c;
      wrong = [a + b * c, a * b * c, a + b + c];
      first = `${p} + ${q} = ${a + b}`;
    } else {
      expr = `${p} - ${q} * ${r}`;
      answer = a - b * c;
      wrong = [(a - b) * c, a * b - c, -answer];
      first = `${q} * ${r} = ${b * c}`;
    }
    const code = lines(`${p} = ${a}`, `${q} = ${b}`, `${r} = ${c}`, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, String(answer), [...wrong.map(String), ...numberNeighbors(answer)]),
      answer: String(answer),
      hints: [
        { nl: 'Python volgt dezelfde rekenregels als bij wiskunde.', en: 'Python follows the same order of operations as math.' },
        { nl: 'Haakjes eerst, dan * en /, dan pas + en -.', en: 'Parentheses first, then * and /, then + and -.' },
        { nl: `Begin met ${first}.`, en: `Start with ${first}.` },
      ],
      verify: { code, output: String(answer) },
    };
  },
};

const reassign: Template = {
  id: 'easy-reassign',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const name = rng.pick(VAR_NAMES);
    const start = rng.int(2, 10);
    const steps = Array.from({ length: rng.int(2, 3) }, () => {
      const op = rng.pick<Op>(['+', '-', '*']);
      return { op, v: op === '*' ? rng.int(2, 4) : rng.int(1, 9) };
    });
    const codeLines = [`${name} = ${start}`];
    let value = start;
    const history: number[] = [];
    for (const s of steps) {
      codeLines.push(rng.chance(0.5) ? `${name} ${s.op}= ${s.v}` : `${name} = ${name} ${s.op} ${s.v}`);
      history.push(value);
      value = apply(value, s.op, s.v);
    }
    codeLines.push(`print(${name})`);
    const code = lines(...codeLines);
    const last = steps[steps.length - 1];
    const beforeLast = history[history.length - 1];
    const wrong = [beforeLast, apply(start, last.op, last.v), start, value + last.v];
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, String(value), [...wrong.map(String), ...numberNeighbors(value)]),
      answer: String(value),
      hints: [
        { nl: 'Elke regel verandert de waarde van de variabele; werk ze één voor één af.', en: 'Each line changes the variable; work through them one at a time.' },
        { nl: `\`${name} += 3\` betekent hetzelfde als \`${name} = ${name} + 3\`.`, en: `\`${name} += 3\` means the same as \`${name} = ${name} + 3\`.` },
        { nl: `Vlak voor de laatste stap is ${name} gelijk aan ${beforeLast}.`, en: `Right before the last step, ${name} equals ${beforeLast}.` },
      ],
      verify: { code, output: String(value) },
    };
  },
};

const strings: Template = {
  id: 'easy-strings',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const [w1, w2] = rng.sample(WORDS, 2);
    const [n1, n2] = rng.sample(['first', 'second', 'word', 'text', 'a', 'b'], 2);
    const variant = rng.int(0, 3);
    let expr: string, answer: string, wrong: string[], hint3: { nl: string; en: string };
    if (variant === 0) {
      expr = `${n1} + ${n2}`;
      answer = w1 + w2;
      wrong = [`${w1} ${w2}`, w2 + w1, `${n1}${n2}`];
      hint3 = { nl: 'Er wordt géén spatie tussen de woorden gezet.', en: 'No space is added between the words.' };
    } else if (variant === 1) {
      const k = rng.int(2, 3);
      expr = `${n1} * ${k}`;
      answer = w1.repeat(k);
      wrong = [Array(k).fill(w1).join(' '), w1, w1.repeat(k + 1), 'Error'];
      hint3 = { nl: `Het woord wordt ${k} keer achter elkaar geplakt.`, en: `The word is glued together ${k} times.` };
    } else if (variant === 2) {
      expr = `len(${n1} + ${n2})`;
      const n = (w1 + w2).length;
      answer = String(n);
      wrong = [String(n + 1), String(w1.length), String(w2.length), '2'];
      hint3 = { nl: `"${w1}" heeft ${w1.length} letters.`, en: `"${w1}" has ${w1.length} letters.` };
    } else {
      expr = `${n1}[0] + ${n2}[-1]`;
      answer = w1[0] + w2[w2.length - 1];
      wrong = [w1[1] + w2[w2.length - 2], w1[0] + w2[0], w1[w1.length - 1] + w2[0], w1[1] + w2[w2.length - 1]];
      hint3 = { nl: 'Index 0 is de eerste letter, index -1 de laatste.', en: 'Index 0 is the first letter, index -1 the last.' };
    }
    const code = lines(`${n1} = "${w1}"`, `${n2} = "${w2}"`, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, wrong),
      answer,
      hints: [
        { nl: 'Strings (tekst) gedragen zich anders dan getallen.', en: 'Strings (text) behave differently from numbers.' },
        { nl: '`+` plakt strings aan elkaar, `*` herhaalt een string.', en: '`+` joins strings, `*` repeats a string.' },
        hint3,
      ],
      verify: { code, output: answer },
    };
  },
};

const ifElif: Template = {
  id: 'easy-if-elif',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const theme = rng.pick([
      { v: 'score', labels: ['Gold', 'Silver', 'Bronze'] },
      { v: 'temperature', labels: ['Hot', 'Warm', 'Cold'] },
      { v: 'speed', labels: ['Fast', 'Normal', 'Slow'] },
      { v: 'battery', labels: ['Full', 'Okay', 'Low'] },
    ]);
    const high = rng.int(12, 18) * 5;
    const low = high - rng.int(3, 5) * 5;
    const op = rng.pick(['>=', '>']);
    const value = rng.pick([high, high - 1, low, low - 1, high + rng.int(1, 9), low + rng.int(1, 4)]);
    const test = (a: number, b: number) => (op === '>=' ? a >= b : a > b);
    const idx = test(value, high) ? 0 : test(value, low) ? 1 : 2;
    const answer = theme.labels[idx];
    const code = lines(
      `${theme.v} = ${value}`,
      `if ${theme.v} ${op} ${high}:`,
      `    print("${theme.labels[0]}")`,
      `elif ${theme.v} ${op} ${low}:`,
      `    print("${theme.labels[1]}")`,
      'else:',
      `    print("${theme.labels[2]}")`,
    );
    const yes = test(value, high);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, theme.labels, 3),
      answer,
      hints: [
        { nl: 'Python controleert de voorwaarden van boven naar beneden en stopt bij de eerste die klopt.', en: 'Python checks the conditions top to bottom and stops at the first one that is true.' },
        { nl: 'Let op het verschil: `>=` is "groter of gelijk", `>` is alleen "groter".', en: 'Mind the difference: `>=` is "greater or equal", `>` is only "greater".' },
        {
          nl: `Is ${value} ${op} ${high}? ${yes ? 'Ja.' : 'Nee, dus door naar de elif.'}`,
          en: `Is ${value} ${op} ${high}? ${yes ? 'Yes.' : 'No, so on to the elif.'}`,
        },
      ],
      verify: { code, output: answer },
    };
  },
};

const booleans: Template = {
  id: 'easy-booleans',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const [p, q] = rng.sample(['a', 'b', 'x', 'y', 'n', 'm'], 2);
    const a = rng.int(1, 12), b = rng.int(1, 12);
    const cmp = (op: string, l: number, r: number) =>
      op === '<' ? l < r : op === '>' ? l > r : op === '==' ? l === r : op === '!=' ? l !== r : op === '<=' ? l <= r : l >= r;
    const op1 = rng.pick(['<', '>', '==', '!=', '<=', '>=']);
    const t = rng.int(3, 10);
    const op2 = rng.pick(['<', '>', '>=']);
    const join = rng.pick(['and', 'or']);
    const c1 = cmp(op1, a, b);
    const c2 = cmp(op2, a + b, t);
    const v1 = c1;
    const v2 = join === 'and' ? c1 && c2 : c1 || c2;
    const py = (v: boolean) => (v ? 'True' : 'False');
    const answer = `${py(v1)} ${py(v2)}`;
    const code = lines(
      `${p} = ${a}`,
      `${q} = ${b}`,
      `print(${p} ${op1} ${q}, ${p} ${op1} ${q} ${join} ${p} + ${q} ${op2} ${t})`,
    );
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, ['True True', 'True False', 'False True', 'False False']),
      answer,
      hints: [
        { nl: 'print met een komma print beide waarden, gescheiden door een spatie.', en: 'print with a comma prints both values, separated by a space.' },
        { nl: '`and` is alleen True als beide kanten True zijn; `or` als minstens één kant True is.', en: '`and` is only True if both sides are True; `or` if at least one side is.' },
        { nl: `${p} ${op1} ${q} is ${py(c1)}, en ${p} + ${q} ${op2} ${t} is ${py(c2)}.`, en: `${p} ${op1} ${q} is ${py(c1)}, and ${p} + ${q} ${op2} ${t} is ${py(c2)}.` },
      ],
      verify: { code, output: answer },
    };
  },
};

const division: Template = {
  id: 'easy-division',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const b = rng.pick([2, 4, 5, 8]);
    const a = rng.chance(0.2) ? b * rng.int(3, 9) : b * rng.int(2, 8) + rng.int(1, b - 1);
    const results = { '/': pyFloat(a / b), '//': String(floorDiv(a, b)), '%': String(pyMod(a, b)) };
    const op = rng.pick(['/', '//', '%'] as const);
    const answer = results[op];
    const others = Object.values(results).filter((r) => r !== answer);
    const code = lines(`total = ${a}`, `groups = ${b}`, `print(total ${op} groups)`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, [...others, String(floorDiv(a, b) + 1), String(a / b), pyFloat(floorDiv(a, b))]),
      answer,
      hints: [
        { nl: 'Python heeft drie soorten delen: `/`, `//` en `%`.', en: 'Python has three kinds of division: `/`, `//` and `%`.' },
        { nl: '`/` geeft altijd een kommagetal (float), `//` rondt naar beneden af, `%` geeft de rest.', en: '`/` always gives a float, `//` rounds down, `%` gives the remainder.' },
        { nl: `${a} = ${b} × ${floorDiv(a, b)} + ${pyMod(a, b)}`, en: `${a} = ${b} × ${floorDiv(a, b)} + ${pyMod(a, b)}` },
      ],
      verify: { code, output: answer },
    };
  },
};

const fillOperator: Template = {
  id: 'easy-fill-operator',
  difficulty: 'easy',
  type: 'fillblank',
  generate(rng) {
    const [p, q] = rng.sample(['a', 'b', 'x', 'y', 'price', 'amount'], 2);
    const ops = ['+', '-', '*', '//', '%'] as const;
    const calc = (a: number, op: (typeof ops)[number], b: number) =>
      op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '//' ? floorDiv(a, b) : pyMod(a, b);
    let a = 0, b = 0, op: (typeof ops)[number] = '+', others: string[] = [];
    // Retry until the chosen operator's result is unique, so exactly one choice is right.
    do {
      a = rng.int(7, 20);
      b = rng.int(2, 6);
      op = rng.pick(ops);
      const res = calc(a, op, b);
      others = ops.filter((o) => o !== op && calc(a, o, b) !== res);
    } while (others.length < 3);
    const result = String(calc(a, op, b));
    const code = lines(`${p} = ${a}`, `${q} = ${b}`, `print(${p} ___ ${q})`);
    return {
      code,
      prompt: promptFill(result),
      choices: makeChoices(rng, op, rng.shuffle(others)),
      answer: op,
      hints: [
        { nl: 'Probeer elke operator in je hoofd uit.', en: 'Try each operator in your head.' },
        { nl: '`//` is delen en naar beneden afronden, `%` is de rest na delen.', en: '`//` divides and rounds down, `%` is the remainder after division.' },
        { nl: `Welke berekening met ${a} en ${b} geeft precies ${result}?`, en: `Which calculation with ${a} and ${b} gives exactly ${result}?` },
      ],
      verify: { code: code.replace('___', op), output: result },
    };
  },
};

const fixSyntax: Template = {
  id: 'easy-fix-syntax',
  difficulty: 'easy',
  type: 'fixbug',
  generate(rng) {
    const scenario = rng.int(0, 3);
    let codeLines: string[], bugLine: number, fix: string, wrong: string[], output: string, hint: { nl: string; en: string };
    if (scenario === 0) {
      const v = rng.pick(['lives', 'level', 'coins', 'lap']);
      const n = rng.int(1, 9);
      const msg = rng.pick(['Match!', 'Yes!', 'Found it']);
      codeLines = [`${v} = ${n}`, `if ${v} = ${n}:`, `    print("${msg}")`];
      bugLine = 2;
      fix = `if ${v} == ${n}:`;
      wrong = [`if ${v} = ${n}`, `if ${v} === ${n}:`, `if (${v} = ${n}):`];
      output = msg;
      hint = { nl: '`=` geeft een waarde, `==` vergelijkt twee waarden.', en: '`=` assigns a value, `==` compares two values.' };
    } else if (scenario === 1) {
      const n = rng.int(3, 5);
      codeLines = [`for i in range(${n})`, '    print(i, end=" ")'];
      bugLine = 1;
      fix = `for i in range(${n}):`;
      wrong = [`for i in range(${n});`, `for (i in range(${n})):`, `for i = range(${n}):`];
      output = Array.from({ length: n }, (_, i) => i).join(' ');
      hint = { nl: 'Een regel die een blok begint (if, for, while, def) eindigt altijd met een dubbele punt.', en: 'A line that starts a block (if, for, while, def) always ends with a colon.' };
    } else if (scenario === 2) {
      const name = rng.pick(PEOPLE);
      const age = rng.int(16, 25);
      codeLines = [`name = "${name}"`, `age = ${age}`, 'print(name + " is " + age)'];
      bugLine = 3;
      fix = 'print(name + " is " + str(age))';
      wrong = ['print(name + " is " + int(age))', 'print(name + " is " + "age")', 'print(name + " is " + age + "")'];
      output = `${name} is ${age}`;
      hint = { nl: 'Je kunt een string en een getal niet met + aan elkaar plakken; zet het getal eerst om.', en: "You can't join a string and a number with +; convert the number first." };
    } else {
      const word = rng.pick(['Hello', 'Welcome', 'Hi there', 'Good luck']);
      const who = rng.pick(PEOPLE);
      codeLines = [`name = "${who}"`, `print(${word.replace(' ', '_')}, name)`];
      bugLine = 2;
      fix = `print("${word}", name)`;
      wrong = [`print(${word}, "name")`, `print("${word}", "name")`, `print(${word.replace(' ', '_')}, "name")`];
      output = `${word} ${who}`;
      hint = { nl: 'Tekst moet tussen aanhalingstekens staan, anders denkt Python dat het een variabele is.', en: 'Text must be in quotes, otherwise Python thinks it is a variable.' };
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
        { nl: 'Het is een klein detail, maar Python is streng.', en: "It's a small detail, but Python is strict." },
        hint,
        { nl: 'Er is maar één optie die geldige Python is én de juiste output geeft.', en: 'Only one option is valid Python and gives the right output.' },
      ],
      verify: { code: lines(...fixed), output },
    };
  },
};

const indexing: Template = {
  id: 'easy-indexing',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const word = rng.pick(WORDS);
    const len = word.length;
    const negative = rng.chance(0.4);
    const i = negative ? rng.int(1, len) : rng.int(1, len - 2);
    const at = negative ? len - i : i;
    const shown = negative ? `-${i}` : String(i);
    const answer = word[at];
    const wrong = [word[at - 1], word[at + 1], ...word.split('')].filter((c): c is string => !!c);
    const v = rng.pick(['word', 'text', 'name']);
    const code = lines(`${v} = "${word}"`, `i = ${shown}`, `print(${v}[i])`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, wrong),
      answer,
      hints: [
        { nl: 'Met [ ] haal je één letter uit een string.', en: 'Use [ ] to get a single letter from a string.' },
        negative
          ? { nl: 'Negatieve indexen tellen vanaf het einde: -1 is de laatste letter.', en: 'Negative indexes count from the end: -1 is the last letter.' }
          : { nl: 'Python begint te tellen bij 0, dus index 0 is de eerste letter.', en: 'Python starts counting at 0, so index 0 is the first letter.' },
        { nl: `"${word}" heeft ${len} letters.`, en: `"${word}" has ${len} letters.` },
      ],
      verify: { code, output: answer },
    };
  },
};

const builtins: Template = {
  id: 'easy-builtins',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const [p, q] = rng.sample(['a', 'b', 'x', 'y', 'low', 'high'], 2);
    const x = rng.int(-9, -2), y = rng.int(2, 9);
    const variant = rng.int(0, 2);
    const [expr, answer, wrong]: [string, number, number[]] =
      variant === 0 ? [`abs(${p}) + ${q}`, -x + y, [x + y, -x - y, y - x + 1]]
        : variant === 1 ? [`max(${p}, ${q}) - min(${p}, ${q})`, y - x, [x - y, y + x, y]]
          : [`min(abs(${p}), ${q})`, Math.min(-x, y), [Math.max(-x, y), x, Math.min(x, y)]];
    const code = lines(`${p} = ${x}`, `${q} = ${y}`, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, String(answer), [...wrong.map(String), ...numberNeighbors(answer)]),
      answer: String(answer),
      hints: [
        { nl: 'Dit zijn ingebouwde functies van Python.', en: 'These are built-in Python functions.' },
        { nl: '`abs` maakt een getal positief, `max` en `min` kiezen de grootste of kleinste.', en: '`abs` makes a number positive, `max` and `min` pick the largest or smallest.' },
        { nl: `abs(${x}) is ${-x}.`, en: `abs(${x}) is ${-x}.` },
      ],
      verify: { code, output: String(answer) },
    };
  },
};

const stringMethods: Template = {
  id: 'easy-string-methods',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const word = rng.pick(WORDS);
    const v = rng.pick(['word', 'text', 'name']);
    const c = rng.pick([...new Set(word)]);
    const start = rng.chance(0.5) ? word[0] : rng.pick([...'bcdkmpstz'].filter((l) => l !== word[0]));
    const variant = rng.int(0, 3);
    let expr: string, answer: string, wrong: string[], hint: Loc;
    if (variant === 0) {
      expr = `${v}.upper()`;
      answer = word.toUpperCase();
      wrong = [word, word[0].toUpperCase() + word.slice(1), word.slice(0, -1).toUpperCase() + word.slice(-1)];
      hint = { nl: '`upper()` maakt alle letters hoofdletters.', en: '`upper()` makes every letter uppercase.' };
    } else if (variant === 1) {
      expr = `${v}.replace("${c}", "*")`;
      answer = word.split(c).join('*');
      wrong = [word.replace(c, '*'), word, `*${word.slice(1)}`, word.split(c).join(''), `${word.slice(0, -1)}*`];
      hint = { nl: `\`replace\` vervangt élke "${c}", niet alleen de eerste.`, en: `\`replace\` replaces every "${c}", not just the first.` };
    } else if (variant === 2) {
      expr = `len(${v}) * 2`;
      answer = String(word.length * 2);
      wrong = [...numberNeighbors(word.length * 2), String(word.length)];
      hint = { nl: `"${word}" heeft ${word.length} letters.`, en: `"${word}" has ${word.length} letters.` };
    } else {
      expr = `${v}.startswith("${start}")`;
      answer = word.startsWith(start) ? 'True' : 'False';
      wrong = ['True', 'False', 'None'];
      hint = { nl: `\`startswith\` kijkt alleen naar het begin: begint "${word}" met "${start}"?`, en: `\`startswith\` only looks at the start: does "${word}" begin with "${start}"?` };
    }
    const code = lines(`${v} = "${word}"`, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, wrong),
      answer,
      hints: [
        { nl: 'Een methode zoals `.upper()` werkt op de string vóór de punt.', en: 'A method like `.upper()` works on the string before the dot.' },
        { nl: 'String-methodes geven een nieuwe waarde terug; de originele string verandert niet.', en: 'String methods return a new value; the original string is unchanged.' },
        hint,
      ],
      verify: { code, output: answer },
    };
  },
};

const listBasics: Template = {
  id: 'easy-list-basics',
  difficulty: 'easy',
  type: 'predict',
  generate(rng) {
    const name = rng.pick(['nums', 'scores', 'values', 'ages']);
    const pool = Array.from({ length: 20 }, (_, i) => i + 1);
    const nums = rng.sample(pool, 4);
    const variant = rng.int(0, 2);
    let expr: string, answer: string, wrong: string[], hint: Loc;
    if (variant === 0) {
      expr = `${name}[1] + len(${name})`;
      answer = String(nums[1] + 4);
      wrong = [nums[0] + 4, nums[1] + 3, nums[2] + 4].map(String);
      hint = { nl: `${name}[1] is het tweede getal: ${nums[1]}.`, en: `${name}[1] is the second number: ${nums[1]}.` };
    } else if (variant === 1) {
      const x = rng.chance(0.5) ? rng.pick(nums) : rng.pick(pool.filter((n) => !nums.includes(n)));
      expr = `${x} in ${name}`;
      answer = nums.includes(x) ? 'True' : 'False';
      wrong = ['True', 'False', 'None'];
      hint = { nl: `\`in\` kijkt of ${x} ergens in de lijst staat.`, en: `\`in\` checks whether ${x} appears anywhere in the list.` };
    } else {
      expr = `${name}[-1] * 2`;
      answer = String(nums[3] * 2);
      wrong = [nums[0] * 2, nums[2] * 2, nums[3] + 2].map(String);
      hint = { nl: `Index -1 is het laatste element: ${nums[3]}.`, en: `Index -1 is the last element: ${nums[3]}.` };
    }
    const code = lines(`${name} = ${pyRepr(nums)}`, `print(${expr})`);
    return {
      code,
      prompt: PROMPT_PREDICT,
      choices: makeChoices(rng, answer, [...wrong, ...(/^\d+$/.test(answer) ? numberNeighbors(Number(answer)) : [])]),
      answer,
      hints: [
        { nl: 'Een lijst bewaart meerdere waarden op volgorde.', en: 'A list stores several values in order.' },
        { nl: 'Indexen beginnen bij 0; -1 is het laatste element; `len` telt de elementen.', en: 'Indexes start at 0; -1 is the last element; `len` counts the elements.' },
        hint,
      ],
      verify: { code, output: answer },
    };
  },
};

const fillCompare: Template = {
  id: 'easy-fill-compare',
  difficulty: 'easy',
  type: 'fillblank',
  generate(rng) {
    const theme = rng.pick([
      { v: 'age', yes: 'Too young', no: 'Welcome' },
      { v: 'score', yes: 'Try again', no: 'You win' },
      { v: 'speed', yes: 'Slow', no: 'Fast' },
    ]);
    const value = rng.int(10, 25);
    const th = value + rng.pick([-3, 0, 3]);
    const ops = ['<', '>', '<=', '>=', '==', '!='];
    const holds = (op: string) =>
      op === '<' ? value < th : op === '>' ? value > th : op === '<=' ? value <= th : op === '>=' ? value >= th : op === '==' ? value === th : value !== th;
    // Exactly one choice gives the wanted branch: the rest all go the other way.
    const wantYes = rng.chance(0.5);
    const op = rng.pick(ops.filter((o) => holds(o) === wantYes));
    const wrong = ops.filter((o) => holds(o) !== wantYes);
    const output = wantYes ? theme.yes : theme.no;
    const code = lines(`${theme.v} = ${value}`, `if ${theme.v} ___ ${th}:`, `    print("${theme.yes}")`, 'else:', `    print("${theme.no}")`);
    return {
      code,
      prompt: promptFill(output),
      choices: makeChoices(rng, op, rng.shuffle(wrong)),
      answer: op,
      hints: [
        { nl: `Moet de voorwaarde waar of onwaar zijn om "${output}" te printen?`, en: `Must the condition be true or false to print "${output}"?` },
        { nl: '`==` is gelijk, `!=` is ongelijk, `<=` is kleiner of gelijk.', en: '`==` is equal, `!=` is not equal, `<=` is less than or equal.' },
        { nl: `Vergelijk ${value} met ${th}.`, en: `Compare ${value} with ${th}.` },
      ],
      verify: { code: code.replace('___', op), output },
    };
  },
};

export const easyTemplates: Template[] = [
  precedence, reassign, strings, ifElif, booleans, division, fillOperator, fixSyntax, indexing,
  builtins, stringMethods, listBasics, fillCompare,
];
