// Detection quality on a labelled corpus of real-world field names (detection-corpus.json).
// Every case must come out right: a missed field is a hole in the data map, a false alarm
// teaches people to ignore the tool.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify, compileRuleSet, loadDefaultRules } from '../src/index.js';

type Case = [entity: string, field: string, expected: string | null, rawType?: string];
const corpus = JSON.parse(
  readFileSync(new URL('./detection-corpus.json', import.meta.url), 'utf8'),
) as { cases: Case[] };
const rules = compileRuleSet(loadDefaultRules());
const MIN_CONFIDENCE = 0.5; // the default `minConfidence`

function detect([entity, field, , rawType]: Case): string | null {
  const c = classify({ names: [field], entity, rawType }, rules);
  return c !== undefined && c.confidence >= MIN_CONFIDENCE ? c.category : null;
}

describe('detection corpus', () => {
  it('has no duplicate cases', () => {
    const keys = corpus.cases.map(([e, f, , t]) => `${e}.${f}:${t ?? ''}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('finds every personal data field (no misses)', () => {
    const missed = corpus.cases
      .filter((c) => c[2] !== null && detect(c) === null)
      .map(([e, f, expected]) => `${e}.${f} should be ${expected}`);
    expect(missed).toEqual([]);
  });

  it('puts every field in the right category', () => {
    const wrong = corpus.cases
      .filter((c) => c[2] !== null && detect(c) !== null && detect(c) !== c[2])
      .map((c) => `${c[0]}.${c[1]} should be ${c[2]}, got ${detect(c)}`);
    expect(wrong).toEqual([]);
  });

  it('reports no field that is not personal data (no false alarms)', () => {
    const falseAlarms = corpus.cases
      .filter((c) => c[2] === null && detect(c) !== null)
      .map((c) => `${c[0]}.${c[1]} reported as ${detect(c)}`);
    expect(falseAlarms).toEqual([]);
  });
});
