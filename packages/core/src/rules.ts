import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { StonekeepError, errorMessage } from './errors.js';
import { COARSE_TYPES, type CoarseType } from './types.js';

const coarseTypeSchema = z.enum(COARSE_TYPES);
const typeAdjustmentsSchema = z.record(coarseTypeSchema, z.number().min(-1).max(1));

export const categorySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'category must be lowercase snake_case');

export const ruleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]*$/, 'rule id must be lowercase kebab/snake case'),
    category: categorySchema,
    description: z.string().optional(),
    match: z
      .array(
        z.object({ pattern: z.string().min(1), confidence: z.number().min(0).max(1) }).strict(),
      )
      .min(1),
    exclude: z.array(z.string().min(1)).default([]),
    formats: z.array(z.string().min(1)).default([]),
    formatConfidence: z.number().min(0).max(1).default(0.98),
    typeAdjustments: typeAdjustmentsSchema.optional(),
  })
  .strict();

/**
 * Hints from the table or model a field belongs to. They only move matches that are ambiguous
 * on their own (`name`, `city`, `age`): `users.name` is a person's name, `products.name` is not.
 */
export const entityHintsSchema = z
  .object({
    /** Patterns for entities that describe people (`users`, `klienci`). */
    person: z.array(z.string().min(1)).default([]),
    /** Patterns for entities that describe things (`products`, `categories`). */
    nonPerson: z.array(z.string().min(1)).default([]),
    /** Added to an ambiguous match in a person entity. */
    personBoost: z.number().min(0).max(1).default(0.2),
    /** Subtracted from an ambiguous match in a non-person entity. */
    nonPersonPenalty: z.number().min(0).max(1).default(0.15),
    /** A match counts as ambiguous when its confidence is below this. */
    ambiguousBelow: z.number().min(0).max(1).default(0.7),
  })
  .strict();

export const rulesFileSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    description: z.string().optional(),
    ignore: z.array(z.string().min(1)).default([]),
    typeAdjustments: typeAdjustmentsSchema.default({}),
    entityHints: entityHintsSchema.optional(),
    rules: z.array(ruleSchema),
  })
  .strict();

export type RuleDefinition = z.input<typeof ruleSchema>;
export type RulesFile = z.output<typeof rulesFileSchema>;

export interface CompiledRule {
  id: string;
  category: string;
  matchers: { re: RegExp; confidence: number }[];
  exclude: RegExp[];
  formats: Set<string>;
  formatConfidence: number;
  typeAdjustments: Partial<Record<CoarseType, number>>;
}

export interface CompiledEntityHints {
  person: RegExp[];
  nonPerson: RegExp[];
  personBoost: number;
  nonPersonPenalty: number;
  ambiguousBelow: number;
}

export interface RuleSet {
  ignore: RegExp[];
  typeAdjustments: Partial<Record<CoarseType, number>>;
  rules: CompiledRule[];
  entityHints?: CompiledEntityHints;
}

export const DEFAULT_RULES_URL = new URL('../rules/default-rules.json', import.meta.url);

function compileRegex(pattern: string, where: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new StonekeepError(
      'RULES',
      `Invalid regular expression in ${where}: ${errorMessage(error)}`,
    );
  }
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

export function parseRulesFile(json: unknown, source: string): RulesFile {
  const parsed = rulesFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new StonekeepError(
      'RULES',
      `Invalid rules file ${source}:\n${formatZodError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function readRulesFile(path: string | URL): RulesFile {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new StonekeepError(
      'RULES',
      `Cannot read rules file ${String(path)}: ${errorMessage(error)}`,
    );
  }
  return parseRulesFile(json, String(path));
}

export function loadDefaultRules(): RulesFile {
  return readRulesFile(DEFAULT_RULES_URL);
}

export function compileRule(rule: z.output<typeof ruleSchema>): CompiledRule {
  return {
    id: rule.id,
    category: rule.category,
    matchers: rule.match.map((m, i) => ({
      re: compileRegex(m.pattern, `rule "${rule.id}" match[${i}]`),
      confidence: m.confidence,
    })),
    exclude: rule.exclude.map((p, i) => compileRegex(p, `rule "${rule.id}" exclude[${i}]`)),
    formats: new Set(rule.formats.map((f) => f.toLowerCase())),
    formatConfidence: rule.formatConfidence,
    typeAdjustments: rule.typeAdjustments ?? {},
  };
}

/**
 * Compile a rules file plus optional extra rules. An extra rule whose `id`
 * matches an existing rule replaces it; otherwise it is appended.
 */
export function compileRuleSet(file: RulesFile, extraRules: readonly unknown[] = []): RuleSet {
  const extras = extraRules.map((r, i) => {
    const parsed = ruleSchema.safeParse(r);
    if (!parsed.success) {
      throw new StonekeepError(
        'CONFIG',
        `Invalid extraRules[${i}]:\n${formatZodError(parsed.error)}`,
      );
    }
    return parsed.data;
  });
  const byId = new Map(file.rules.map((r) => [r.id, r]));
  for (const extra of extras) byId.set(extra.id, extra);
  const ruleSet: RuleSet = {
    ignore: file.ignore.map((p, i) => compileRegex(p, `ignore[${i}]`)),
    typeAdjustments: file.typeAdjustments,
    rules: [...byId.values()].map(compileRule),
  };
  const hints = file.entityHints;
  if (hints) {
    ruleSet.entityHints = {
      person: hints.person.map((p, i) => compileRegex(p, `entityHints.person[${i}]`)),
      nonPerson: hints.nonPerson.map((p, i) => compileRegex(p, `entityHints.nonPerson[${i}]`)),
      personBoost: hints.personBoost,
      nonPersonPenalty: hints.nonPersonPenalty,
      ambiguousBelow: hints.ambiguousBelow,
    };
  }
  return ruleSet;
}

export { formatZodError };
