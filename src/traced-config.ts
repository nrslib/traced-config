import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseCli } from './cli.js';
import { buildDefaultArgName, buildDefaultEnvName, normalizeArgName } from './naming.js';
import type {
  FileLabel,
  FileParser,
  FileValueRecord,
  FormatValidator,
  InferSchemaValues,
  Origin,
  ResolvedSchemaEntry,
  SchemaShape,
  SourceToggles,
  TracedConfigApi,
  TracedConfigOptions,
  TracedValue,
  UnknownKeyIssue,
  ValidateError,
} from './types.js';
import { createDefaultParsers, getFileExtension, isMissingFileError, isPlainObject } from './utils.js';
import { coerceInputValue, validateFormatValue } from './validation.js';

const DEFAULT_SOURCES: SourceToggles = {
  global: true,
  local: true,
  env: true,
  cli: false,
};

export function tracedConfig<TSchema extends SchemaShape = {}>(
  options: TracedConfigOptions<TSchema> = {},
): TracedConfigApi<InferSchemaValues<TSchema>> {
  const envStyle = options.envStyle ?? 'SCREAMING_SNAKE';
  const argStyle = options.argStyle ?? 'kebab';
  const schema = new Map<string, ResolvedSchemaEntry>();
  const globalValues = new Map<string, FileValueRecord>();
  const localValues = new Map<string, FileValueRecord>();
  const unknownFileKeys: UnknownKeyIssue[] = [];
  const parsers = createDefaultParsers();
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

    let traced: TracedValue<unknown> = {
      value: entry.default,
      source: null,
      origin: 'default',
    };

    if (entry.sources.global) {
      const fromGlobal = globalValues.get(key);
      if (fromGlobal) {
        traced = { value: fromGlobal.value, source: fromGlobal.source, origin: 'global' };
      }
    }

    if (entry.sources.local) {
      const fromLocal = localValues.get(key);
      if (fromLocal) {
        traced = { value: fromLocal.value, source: fromLocal.source, origin: 'local' };
      }
    }

    if (entry.sources.env) {
      const envValue = process.env[entry.env];
      if (envValue !== undefined) {
        traced = {
          value: coerceInputValue(envValue, entry),
          source: entry.env,
          origin: 'env',
        };
      }
    }

    if (entry.sources.cli) {
      const cliValue = cachedCliValues.get(entry.arg);
      if (cliValue) {
        traced = {
          value: coerceInputValue(cliValue.value, entry),
          source: cliValue.source,
          origin: 'cli',
        };
      }
    }

    return traced;
  }

  function addSchema<TNextSchema extends SchemaShape>(
    next: TNextSchema,
  ): TracedConfigApi<Record<string, unknown> & InferSchemaValues<TNextSchema>> {
    for (const [key, rawEntry] of Object.entries(next)) {
      if (key.includes('.')) {
        throw new Error(`Nested schema keys are not supported: '${key}'`);
      }

      if (schema.has(key)) {
        throw new Error(`Schema key '${key}' is already defined`);
      }

      if (typeof rawEntry.doc !== 'string' || rawEntry.doc.trim().length === 0) {
        throw new Error(`Schema key '${key}' must define a non-empty doc string`);
      }

      const env = rawEntry.env ?? buildDefaultEnvName(key, envStyle);
      const arg = rawEntry.arg ?? buildDefaultArgName(key, argStyle);
      const sources: SourceToggles = {
        ...DEFAULT_SOURCES,
        ...(rawEntry.sources ?? {}),
      };

      schema.set(key, {
        default: rawEntry.default,
        doc: rawEntry.doc,
        format: rawEntry.format,
        env,
        arg: normalizeArgName(arg),
        sources,
      });
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

  async function loadFile(entries: Array<{ path: string; label: FileLabel }>): Promise<void> {
    for (const entry of entries) {
      if (!isPlainObject(entry) || typeof entry.path !== 'string' || (entry.label !== 'global' && entry.label !== 'local')) {
        throw new Error('loadFile entries must be objects with { path, label } where label is global or local');
      }

      try {
        await access(entry.path, constants.F_OK);
      } catch (error) {
        if (isMissingFileError(error)) {
          continue;
        }

        throw error;
      }

      const content = await readFile(entry.path, 'utf8');
      const extension = getFileExtension(entry.path);
      const parser = parsers.get(extension);
      if (!parser) {
        throw new Error(`Unsupported file type for path: ${entry.path}`);
      }

      const parsedRaw = parser(content);
      const parsed = isPlainObject(parsedRaw) ? parsedRaw : {};

      for (const [key, value] of Object.entries(parsed)) {
        if (!schema.has(key)) {
          unknownFileKeys.push({ key, source: entry.path, origin: entry.label });
          continue;
        }

        if (entry.label === 'global') {
          globalValues.set(key, { value, source: entry.path });
        } else {
          localValues.set(key, { value, source: entry.path });
        }
      }
    }
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
    validate,
  };

  if (options.schema) {
    addSchema(options.schema);
  }

  return api as unknown as TracedConfigApi<InferSchemaValues<TSchema>>;
}
