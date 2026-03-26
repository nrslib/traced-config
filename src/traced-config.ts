import { parseCli } from './cli.js';
import { loadConfigFiles, createParserRegistry, type LoadFileEntry } from './traced-config-files.js';
import { resolveSchemaValue } from './traced-config-resolution.js';
import { createDefaultSchemaSources, findPrefixCollision, resolveSchemaEntry } from './traced-config-schema.js';
import type {
  FileParser,
  FileValueRecord,
  FormatValidator,
  InferSchemaValues,
  Origin,
  ResolvedSchemaEntry,
  SchemaShape,
  TracedConfigApi,
  TracedConfigOptions,
  TracedValue,
  UnknownKeyIssue,
  ValidateError,
} from './types.js';
import { isBuiltinStringFormat, validateFormatValue } from './validation.js';

export function tracedConfig<TSchema extends SchemaShape = {}>(
  options: TracedConfigOptions<TSchema> = {},
): TracedConfigApi<InferSchemaValues<TSchema>> {
  const envStyle = options.envStyle ?? 'SCREAMING_SNAKE';
  const argStyle = options.argStyle ?? 'kebab';
  const defaultSchemaSources = createDefaultSchemaSources(options.defaultSources);
  const schema = new Map<string, ResolvedSchemaEntry>();
  const globalValues = new Map<string, FileValueRecord>();
  const localValues = new Map<string, FileValueRecord>();
  const unknownFileKeys: UnknownKeyIssue[] = [];
  const parsers = createParserRegistry();
  const customFormats = new Map<string, FormatValidator>();
  const cachedCliValues = parseCli(process.argv);

  function assertKnownKey(key: string): ResolvedSchemaEntry {
    const entry = schema.get(key);
    if (!entry) {
      throw new Error(`Schema key '${key}' is not defined`);
    }

    return entry;
  }

  function resolveKey(key: string): TracedValue<unknown> {
    const entry = assertKnownKey(key);
    return resolveSchemaValue(entry, globalValues, localValues, cachedCliValues, key);
  }

  function addSchema<TNextSchema extends SchemaShape>(
    next: TNextSchema,
  ): TracedConfigApi<Record<string, unknown> & InferSchemaValues<TNextSchema>> {
    const pendingEntries: Array<[string, ResolvedSchemaEntry]> = [];

    for (const [key, rawEntry] of Object.entries(next)) {
      if (schema.has(key)) {
        throw new Error(`Schema key '${key}' is already defined`);
      }

      const collidedKey = findPrefixCollision(key, schema.keys()) ?? findPrefixCollision(
        key,
        pendingEntries.map(([pendingKey]) => pendingKey),
      );
      if (collidedKey) {
        throw new Error(`Schema key '${key}' has a prefix collision with existing key '${collidedKey}'`);
      }

      const resolvedEntry = resolveSchemaEntry(key, rawEntry, envStyle, argStyle, defaultSchemaSources);
      pendingEntries.push([key, resolvedEntry]);
    }

    for (const [key, entry] of pendingEntries) {
      schema.set(key, entry);
    }

    return api as unknown as TracedConfigApi<Record<string, unknown> & InferSchemaValues<TNextSchema>>;
  }

  function addParser(extension: string, parser: FileParser): void {
    if (typeof extension !== 'string' || extension.trim().length === 0) {
      throw new Error('Parser extension must be a non-empty string');
    }

    if (typeof parser !== 'function') {
      throw new Error('Parser must be a function');
    }

    const normalized = extension.replace(/^\./, '').toLowerCase();
    parsers.set(normalized, parser);
  }

  function addFormat(name: string, validator: FormatValidator): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Format name must be a non-empty string');
    }

    if (typeof validator !== 'function') {
      throw new Error('Format validator must be a function');
    }

    customFormats.set(name, validator);
  }

  async function loadFile(entries: LoadFileEntry[]): Promise<void> {
    await loadConfigFiles(
      entries,
      new Set(schema.keys()),
      parsers,
      { globalValues, localValues },
      unknownFileKeys,
    );
  }

  function get(key: string): unknown {
    return resolveKey(key).value;
  }

  function getSource(key: string): string | null {
    return resolveKey(key).source;
  }

  function getOrigin(key: string): Origin {
    return resolveKey(key).origin;
  }

  function getTraced(key: string): TracedValue<unknown> {
    return resolveKey(key);
  }

  function getSchema(): Record<string, ResolvedSchemaEntry> {
    const snapshot: Record<string, ResolvedSchemaEntry> = {};
    for (const [key, entry] of schema.entries()) {
      snapshot[key] = {
        default: entry.default,
        doc: entry.doc,
        format: entry.format,
        env: entry.env,
        arg: entry.arg.replace(/^--/u, ''),
        sources: { ...entry.sources },
      };
    }

    return snapshot;
  }

  function validate(validateOptions: { strict?: boolean } = {}): ValidateError[] {
    const errors: ValidateError[] = [];

    for (const [key, entry] of schema.entries()) {
      const resolved = resolveKey(key);
      let error = validateFormatValue(key, resolved.value, entry.format);
      if (!error && typeof entry.format === 'string') {
        const validator = customFormats.get(entry.format);
        if (validator && !validator(resolved.value)) {
          error = {
            key,
            value: resolved.value,
            message: `${entry.format} validation failed`,
          };
        } else if (!validator && !isBuiltinStringFormat(entry.format)) {
          error = {
            key,
            value: resolved.value,
            message: `Unknown format '${entry.format}'`,
          };
        }
      }

      if (error) {
        errors.push(error);
      }
    }

    if (validateOptions.strict) {
      for (const unknown of unknownFileKeys) {
        errors.push({
          key: unknown.key,
          source: unknown.source,
          origin: unknown.origin,
          message: `Unknown key '${unknown.key}'`,
        });
      }
    }

    return errors;
  }

  const api: TracedConfigApi<Record<string, unknown>> = {
    addSchema,
    addParser,
    addFormat,
    loadFile,
    get,
    getSource,
    getOrigin,
    getTraced,
    getSchema,
    validate,
  };

  if (options.schema) {
    addSchema(options.schema);
  }

  return api as unknown as TracedConfigApi<InferSchemaValues<TSchema>>;
}
