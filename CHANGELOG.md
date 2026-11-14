# Changelog

## Unreleased

### Detection

Measured on a labelled corpus of 327 field names (`packages/core/test/detection-corpus.json`): the
0.8.0 rules got 142 of them wrong, these rules get all of them right. The corpus includes the
languages added below, so part of that gap is new coverage.

- **The table name settles ambiguous fields.** `users.name`, `customers.city` and `patients.weight`
  are reported; `products.name`, `warehouses.city` and `products.weight` no longer are. New
  `entityHints` section in the rules file, see `packages/docs/rules.md`.
- **Sensitive names ending in `_status`, `_type` or `_template` are no longer ignored**:
  `blood_type`, `marital_status`, `vaccination_status`, `fingerprint_template`.
- **Names with a prefix or without separators**: `billing_first_name`, `customer_first_name`,
  `FIRSTNAME`, `EMAILADDRESS`, `DATEOFBIRTH`, `STREETADDRESS`, `phone1`, `address1`.
- **New kinds of fields**: card last four digits and expiry, house and apartment numbers,
  city/state/country next to an address, last known location, device identifiers (IMEI, push
  tokens, visitor ids), social network accounts, profile photos, vehicle registration, employment
  and immigration status, criminal records, vaccination and pregnancy, security questions and
  backup codes, generic document numbers inside person tables.
- **Languages**: German, French, Spanish and Italian names, more Polish ones (`miasto`, `nr_domu`,
  `stan_cywilny`, `wyznanie`, `diagnoza`, `grupa_krwi`, `karta_pobytu`, `numer_karty`), and
  letters such as `ß` and `ø` are folded (`straße` matches `strasse`).
- **Fewer false alarms**: `cell` (a spreadsheet cell), `race_condition`, `pin_position`,
  `bind_address`, `host_address`.

After upgrading, run `stonekeep scan` and review the diff of the data map: fields that are newly
found fail `check` until they are mapped, and fields that are no longer reported show up as stale.

Fixes for the four open CodeQL alerts.

- `normalizeName` and `coarseType` run in linear time. Two regular expressions backtracked
  quadratically on a long run of capitals, underscores or spaces.
- Breach report: a backslash in a table cell is escaped before the `|`, so `\|` in a name cannot
  break out of the cell.
- Site build: file names are fully escaped before they go into a regular expression, and tags are
  stripped from FAQ text repeatedly until none are left.

## 0.8.0

The scanner no longer passes by skipping. Either it reads a schema, or it says that it could not
and `check` fails.

### Upgrading

- **`check` now fails when part of the schema could not be read.** Unreadable files or directories,
  binary or oversized `.sql`/`.prisma` files, a `CREATE TABLE` whose brackets never close, and
  OpenAPI or JSON Schema files with syntax errors are listed under `incomplete` and make `check`
  exit with `1`. Fix the file, add it to `exclude` in `stonekeep.config.json`, or pass
  `--allow-incomplete` (GitHub Action input: `allow-incomplete`).
- **The scanner finds fields it used to miss** (list below). After upgrading, `check` may report
  them as unmapped. Run `stonekeep scan`, review the diff of `stonekeep-datamap.json` and commit it.

### Fields that were missed before

- SQL: column and table names with non-ASCII letters (`imię`, `płeć`, `zamówienia`).
- SQL: every statement after the first one in scripts without semicolons, and T-SQL scripts that
  separate batches with `GO`.
- SQL: `ALTER TABLE ... ADD (a int, b text)`, `CREATE TABLE ... (LIKE other)` and MySQL
  `CREATE TABLE copy LIKE original`.
- SQL: everything after a string literal that ends with a backslash (`DEFAULT 'C:\'`), and after
  quoted identifiers that contain a quote or `--`.
- SQL: files saved as UTF-16 with a byte order mark.
- TypeORM: `@Column` fields of base and embedded classes that have no `@Entity`; `.mts` and `.cts`
  files.
- OpenAPI: inline schemas under `paths` (parameters, request bodies, responses), Swagger 2 body
  parameters and response schemas. Their entity is the operation, e.g. `POST /users.request.email`.
- JSON Schema and OpenAPI in YAML: every document of a multi-document file, and schemas reached
  through anchors and aliases.

### False positives removed

- SQL: DDL inside a function body quoted with a numbered dollar tag (`$fn1$ ... $fn1$`) is no longer
  read as a real table.

### Other

- `scan` and `check` report `incomplete` in text, JSON and GitHub annotation output; the MCP server
  returns it too.
- A directory that cannot be listed no longer aborts the scan: it is reported as incomplete.
- A datamap entry is not called stale while its source file could not be read.
- New tests: 24 reliability cases, including property-based tests that feed the four parsers
  arbitrary input and require that they neither throw nor return malformed fields.
