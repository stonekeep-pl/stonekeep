# Classification rules

The built-in rules are in
[`packages/core/rules/default-rules.json`](../core/rules/default-rules.json). A rules file looks
like this:

```json
{
  "version": 1,
  "ignore": ["^(is|has)_", "_(verified|count)$"],
  "typeAdjustments": { "boolean": -0.5 },
  "rules": [
    {
      "id": "email",
      "category": "contact",
      "description": "Email addresses.",
      "match": [
        { "pattern": "^(.*_)?e_?mail(_address)?$", "confidence": 0.95 },
        { "pattern": "(^|_)e_?mail(_|$)", "confidence": 0.8 }
      ],
      "exclude": [],
      "formats": ["email"],
      "formatConfidence": 0.98,
      "typeAdjustments": {}
    }
  ]
}
```

| Field              | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `ignore`           | Patterns. A name that matches one is never classified by name (it can still match by `format`)   |
| `typeAdjustments`  | Score change per coarse type: `string`, `number`, `boolean`, `date`, `json`, `binary`, `unknown` |
| `rules[].match`    | Regexes tested against the **normalized** name. The highest matching confidence is used          |
| `rules[].exclude`  | A name that matches one of these is skipped for this rule                                        |
| `rules[].formats`  | JSON Schema / OpenAPI `format` values that trigger the rule                                      |
| `rules[].category` | Any lowercase snake_case string. You can define your own categories                              |
| `entityHints`      | Optional. Uses the table or model name to settle ambiguous names. See below                      |

Normalization lowercases the name and converts it to snake_case:

- `phoneNumber` becomes `phone_number`
- `IPAddress` becomes `ip_address`
- `user-email` becomes `user_email`

## Entity hints

Some names say nothing on their own: `name`, `city`, `country`, `age`, `weight`. The table or
model they sit in settles it. `users.name` is a person's name, `products.name` is not.

```json
"entityHints": {
  "person": ["(^|_)(users?|customers?|klienci)$"],
  "nonPerson": ["(^|_)(products?|categor(y|ies))$"],
  "personBoost": 0.2,
  "nonPersonPenalty": 0.15,
  "ambiguousBelow": 0.7
}
```

- The patterns are tested against the normalized entity name. Anchor them at the end, because the
  head noun comes last: `user_roles` are roles, not users.
- Only a match whose confidence is below `ambiguousBelow` moves. A clear name such as `email` or
  `pesel` is reported in any table, and so is a field with a declared `format`.
- In a person entity the match gains `personBoost`; in a non-person entity it loses
  `nonPersonPenalty`; in any other entity it stays as it is.
- A rule can use this on purpose: a pattern with confidence `0.4` is reported only inside a person
  entity (`0.4 + 0.2`), which is how `users.country` is found while `shipments.country` is not.

A rules file without `entityHints` classifies by field name alone.

## Built-in categories

`contact`, `identity`, `government_id`, `financial`, `location`, `online_identifier`, `demographic`,
`special_category`, `health`, `credential`.

## Languages

The `eu-*` rules match common German (`vorname`, `geburtsdatum`, `straße`, `steuer_id`), French
(`prenom`, `date_de_naissance`, `mot_de_passe`), Spanish (`apellidos`, `fecha_de_nacimiento`,
`dni`) and Italian (`cognome`, `codice_fiscale`, `indirizzo`) field names.

Besides English, the `cee-*` rules match Polish (`pesel`, `nr_dowodu`, `imie`, `nazwisko`,
`adres_zamieszkania`), Romanian (`cnp`, `serie_buletin`, `prenume`, `domiciliu`) and Hungarian
(`adoazonosito_jel`, `taj_szam`, `vezeteknev`, `lakcim`) field names, plus national IDs from
Czechia and Slovakia (`rodne_cislo`), Bulgaria (`egn`), Croatia (`oib`), Slovenia (`emso`) and the
Baltics. Names are folded to ASCII before matching, so `imię`, `születési_dátum`, `reședință` and
`straße` match too.

## Measuring detection

[`packages/core/test/detection-corpus.json`](../core/test/detection-corpus.json) holds labelled
field names: what must be found, in which category, and what must not be reported. The test suite
fails on any miss, wrong category or false alarm. When you find a field the scanner got wrong in a
real schema, add it there first, then change the rules.

## Customising

There are three ways to customise classification in `stonekeep.config.json`:

- **Add or replace individual rules.** Use `extraRules`. A rule with an existing `id` replaces the
  built-in rule.
- **Replace the whole rule set.** Set `"rulesFile": "path/to/rules.json"`.
- **Decide individual fields.** Use `overrides`, for example
  `{ "users.handle": { "ignore": true, "note": "..." } }`.

Notes in overrides are committed to your repository and appear in code review, so don't put
personal data in them.
