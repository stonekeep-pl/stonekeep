import { coarseType, normalizeName } from './normalize.js';
import type { RuleSet } from './rules.js';
import type { Classification } from './types.js';

export interface ClassifyInput {
  /** Candidate names (e.g. property name and mapped column name). */
  names: readonly string[];
  rawType?: string | undefined;
  format?: string | undefined;
  /**
   * Table, model or schema the field belongs to. Used only to settle names that are ambiguous
   * on their own (`name`, `city`, `age`), through the rule set's `entityHints`.
   */
  entity?: string | undefined;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** +boost for an entity that describes people, -penalty for one that describes things, else 0. */
function entityAdjustment(entity: string | undefined, ruleSet: RuleSet): number {
  const hints = ruleSet.entityHints;
  if (!hints || entity === undefined) return 0;
  const name = normalizeName(entity);
  if (name.length === 0) return 0;
  // the head noun comes last (`user_roles` are roles), and both lists are anchored at the end
  if (hints.nonPerson.some((re) => re.test(name))) return -hints.nonPersonPenalty;
  if (hints.person.some((re) => re.test(name))) return hints.personBoost;
  return 0;
}

/**
 * Rule-based classification. Returns the best-scoring rule or `undefined`.
 * Ties are resolved by rule order. This is a heuristic, not a legal opinion.
 */
export function classify(input: ClassifyInput, ruleSet: RuleSet): Classification | undefined {
  const names = [...new Set(input.names.map(normalizeName).filter((n) => n.length > 0))];
  const matchable = names.filter((n) => !ruleSet.ignore.some((re) => re.test(n)));
  const format = input.format?.toLowerCase();
  const type = coarseType(input.rawType);
  const byEntity = entityAdjustment(input.entity, ruleSet);
  const ambiguousBelow = ruleSet.entityHints?.ambiguousBelow ?? 0;

  let best: Classification | undefined;
  for (const rule of ruleSet.rules) {
    let score = 0;
    for (const name of matchable) {
      if (rule.exclude.some((re) => re.test(name))) continue;
      for (const m of rule.matchers) {
        if (m.confidence > score && m.re.test(name)) score = m.confidence;
      }
    }
    // The entity only moves a match that is ambiguous by name. A clear name (`email`) and a
    // declared format stay as they are.
    if (score > 0 && score < ambiguousBelow) score += byEntity;
    if (format !== undefined && rule.formats.has(format)) {
      score = Math.max(score, rule.formatConfidence);
    }
    if (score <= 0) continue;
    const adjustment = rule.typeAdjustments[type] ?? ruleSet.typeAdjustments[type] ?? 0;
    const confidence = round2(clamp01(score + adjustment));
    if (confidence > 0 && (best === undefined || confidence > best.confidence)) {
      best = { category: rule.category, rule: rule.id, confidence };
    }
  }
  return best;
}
