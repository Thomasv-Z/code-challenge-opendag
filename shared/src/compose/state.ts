// The simulated Python state that composed programs run against.
import { pyRepr } from '../py';

export type Val = number | string | number[];
export type Kind = 'int' | 'str' | 'list';

export interface State {
  /** Variables in creation order. Ints are Python ints, lists are lists of ints. */
  vars: Map<string, Val>;
  out: string[];
}

/** A real Python runtime error (NameError, IndexError, ZeroDivisionError, ...). */
export class PyError extends Error {}
/** Our own sanity limit: the program is valid Python, but unsuitable as a question. */
export class GuardError extends Error {}

export const MAX_INT = 10_000;
export const MAX_LIST = 8;
export const MAX_STR = 24;

export const kindOf = (v: Val): Kind => (typeof v === 'number' ? 'int' : typeof v === 'string' ? 'str' : 'list');

export const newState = (): State => ({ vars: new Map(), out: [] });

export const cloneState = (s: State): State => ({
  vars: new Map([...s.vars].map(([k, v]) => [k, Array.isArray(v) ? [...v] : v])),
  out: [...s.out],
});

export function read<K extends Kind>(s: State, name: string, kind: K): K extends 'int' ? number : K extends 'str' ? string : number[] {
  const v = s.vars.get(name);
  if (v === undefined || kindOf(v) !== kind) throw new PyError(`NameError: ${name}`);
  return v as never;
}

export function write(s: State, name: string, v: Val) {
  if (typeof v === 'number' && (!Number.isInteger(v) || Math.abs(v) > MAX_INT)) throw new GuardError('int');
  if (typeof v === 'string' && v.length > MAX_STR) throw new GuardError('str');
  if (Array.isArray(v) && (v.length > MAX_LIST || v.some((x) => Math.abs(x) > MAX_INT))) throw new GuardError('list');
  s.vars.set(name, v);
}

/** Python's str() of a value, as print() shows it. */
export const show = (v: Val) => (typeof v === 'string' ? v : pyRepr(v));
