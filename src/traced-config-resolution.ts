import { coerceInputValue } from './validation.js';
import type { CliValue, FileValueRecord, ResolvedSchemaEntry, TracedValue } from './types.js';

export function resolveSchemaValue(
  entry: ResolvedSchemaEntry,
  globalValues: ReadonlyMap<string, FileValueRecord>,
  localValues: ReadonlyMap<string, FileValueRecord>,
  cachedCliValues: ReadonlyMap<string, CliValue>,
  key: string,
): TracedValue<unknown> {
  let traced: TracedValue<unknown> = {
    value: entry.default,
    source: null,
    origin: 'default',
  };

  const globalValue = entry.sources.global ? globalValues.get(key) : undefined;
  if (globalValue) {
    traced = { value: globalValue.value, source: globalValue.source, origin: 'global' };
  }

  const localValue = entry.sources.local ? localValues.get(key) : undefined;
  if (localValue) {
    traced = { value: localValue.value, source: localValue.source, origin: 'local' };
  }

  const envValue = entry.sources.env ? process.env[entry.env] : undefined;
  if (envValue !== undefined) {
    traced = {
      value: coerceInputValue(envValue, entry),
      source: entry.env,
      origin: 'env',
    };
  }

  const cliValue = entry.sources.cli ? cachedCliValues.get(entry.arg) : undefined;
  if (cliValue) {
    traced = {
      value: coerceInputValue(cliValue.value, entry),
      source: cliValue.source,
      origin: 'cli',
    };
  }

  return traced;
}
