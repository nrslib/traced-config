# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-03-26

### Added
- ネストされたスキーマキーのサポート: `db.host` のようなドット区切りキーを `addSchema()` で定義可能に (#16)
- 設定ファイルのネスト構造自動フラット化: YAML/JSON の階層構造をスキーマのドットキーに自動マッピング (#16)
- プレフィックス衝突検出: `db` と `db.host` のように親子関係のあるキーを同時に定義した場合にエラーを報告 (#16)

### Changed
- 命名変換（env/arg 自動生成）がドット区切りキーに対応: `db.host` → `DB_HOST`（env）/ `--db-host`（arg） (#16)

## [0.1.0] - 2026-03-09

### Added
- Core API: `tracedConfig()` factory with type-safe schema definition and value resolution (#1, #3)
- Value tracing: `get()`, `getSource()`, `getOrigin()`, `getTraced()` to retrieve values with their origin information
- Precedence chain: default < global file < local file < env < cli, configurable per key via `sources` (#3)
- File loading: `loadFile()` with YAML, JSON, and `.env` built-in parsers (#4, #13)
- Schema extension: `addSchema()` returns a new typed API with merged schema types
- Custom parsers via `addParser()` and custom format validators via `addFormat()`
- Built-in format validators: `port`, `nat`, `int`, `url`, `ipaddress`, plus type constructors (`String`, `Number`, `Boolean`, `Array`) and enum arrays (#5)
- Validation: `validate()` with `strict` mode for unknown file key detection
- Unregistered format detection: `validate()` reports errors for format names that are neither built-in nor registered via `addFormat()` (#13)
- Schema introspection: `getSchema()` returns a snapshot of all registered schema entries including `doc` metadata (#13)
- Auto-naming: camelCase keys automatically map to `SCREAMING_SNAKE` env vars and `--kebab-case` CLI args
- CLI argument parsing with `--key value` and `--key=value` syntax, cached at initialization (#7)
- `doc` field required on all schema entries for self-documenting configuration (#8)
- Parse error context: `loadFile()` includes file path and label in error messages (#13)
- Input coercion: string values from env/cli/files automatically coerced based on format or default type (#10)
