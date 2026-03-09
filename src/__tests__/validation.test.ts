import { describe, expect, it } from 'vitest';
import { coerceInputValue } from '../validation.js';
import type { ResolvedSchemaEntry } from '../types.js';

function createEntry(overrides: Partial<ResolvedSchemaEntry>): ResolvedSchemaEntry {
  return {
    doc: 'test doc',
    default: '',
    env: 'DUMMY_ENV',
    arg: 'dummy-arg',
    sources: { global: true, local: true, env: true, cli: true },
    ...overrides,
  };
}

describe('coerceInputValue', () => {
  it('should coerce numeric strings consistently for format and default fallbacks', () => {
    const formatEntry = createEntry({ default: '0', format: 'int' });
    const defaultEntry = createEntry({ default: 0, format: undefined });

    const fromFormat = coerceInputValue('42', formatEntry);
    const fromDefault = coerceInputValue('42', defaultEntry);

    expect(fromFormat).toBe(42);
    expect(fromDefault).toBe(42);
  });

  it('should preserve original string when numeric coercion fails', () => {
    const formatEntry = createEntry({ default: 0, format: 'port' });
    const defaultEntry = createEntry({ default: 0, format: undefined });

    const fromFormat = coerceInputValue('invalid-number', formatEntry);
    const fromDefault = coerceInputValue('invalid-number', defaultEntry);

    expect(fromFormat).toBe('invalid-number');
    expect(fromDefault).toBe('invalid-number');
  });

  it('should coerce boolean strings consistently for format and default fallbacks', () => {
    const formatEntry = createEntry({ default: true, format: Boolean });
    const defaultEntry = createEntry({ default: true, format: undefined });

    const truthyFromFormat = coerceInputValue('1', formatEntry);
    const falsyFromFormat = coerceInputValue('false', formatEntry);
    const truthyFromDefault = coerceInputValue('1', defaultEntry);
    const falsyFromDefault = coerceInputValue('false', defaultEntry);

    expect(truthyFromFormat).toBe(true);
    expect(falsyFromFormat).toBe(false);
    expect(truthyFromDefault).toBe(true);
    expect(falsyFromDefault).toBe(false);
  });

  it('should split comma-separated strings consistently for format and default fallbacks', () => {
    const formatEntry = createEntry({ default: ['x'], format: Array });
    const defaultEntry = createEntry({ default: ['x'], format: undefined });

    const fromFormat = coerceInputValue('red, green, blue', formatEntry);
    const fromDefault = coerceInputValue('red, green, blue', defaultEntry);

    expect(fromFormat).toEqual(['red', 'green', 'blue']);
    expect(fromDefault).toEqual(['red', 'green', 'blue']);
  });
});
