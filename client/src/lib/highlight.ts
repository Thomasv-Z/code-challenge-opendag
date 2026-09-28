export type TokenKind = 'keyword' | 'builtin' | 'string' | 'number' | 'comment' | 'op' | 'blank' | 'text';
export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is',
  'True', 'False', 'None', 'break', 'continue', 'pass', 'lambda', 'import', 'from', 'class',
]);
const BUILTINS = new Set(['print', 'range', 'len', 'str', 'int', 'float', 'list', 'dict', 'max', 'min', 'sum', 'enumerate', 'zip', 'sorted', 'abs']);

const RULES: [TokenKind | 'word', RegExp][] = [
  ['blank', /^___/],
  ['comment', /^#.*/],
  ['string', /^("[^"]*"|'[^']*')/],
  ['number', /^\d+(\.\d+)?/],
  ['word', /^[A-Za-z_]\w*/],
  ['op', /^(\*\*|\/\/|==|!=|<=|>=|\+=|-=|\*=|[-+*/%<>=])/],
];

/** A small tokenizer covering the subset of Python the templates generate. */
export function tokenizeLine(line: string): Token[] {
  const out: Token[] = [];
  let rest = line;
  while (rest.length) {
    let matched = false;
    for (const [kind, re] of RULES) {
      const m = re.exec(rest);
      if (!m) continue;
      const text = m[0];
      const k: TokenKind = kind === 'word' ? (KEYWORDS.has(text) ? 'keyword' : BUILTINS.has(text) ? 'builtin' : 'text') : kind;
      const prev = out[out.length - 1];
      if (k === 'text' && prev?.kind === 'text') prev.text += text;
      else out.push({ kind: k, text });
      rest = rest.slice(text.length);
      matched = true;
      break;
    }
    if (!matched) {
      const prev = out[out.length - 1];
      if (prev?.kind === 'text') prev.text += rest[0];
      else out.push({ kind: 'text', text: rest[0] });
      rest = rest.slice(1);
    }
  }
  return out;
}
