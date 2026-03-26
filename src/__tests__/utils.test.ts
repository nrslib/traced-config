import { describe, expect, it } from 'vitest';
import { flattenFileEntries } from '../utils.js';

describe('flattenFileEntries', () => {
  it('should flatten nested objects into dotted keys', () => {
    expect(
      flattenFileEntries({
        provider_options: {
          claude: {
            effort: 'high',
          },
        },
      }),
    ).toEqual([['provider_options.claude.effort', 'high']]);
  });

  it('should keep schema-defined object values as leaf entries', () => {
    const settings = { enabled: true };

    expect(flattenFileEntries({ settings }, new Set(['settings']))).toEqual([['settings', settings]]);
  });

  it('should reject circular nested objects', () => {
    const root: Record<string, unknown> = {};
    root.self = root;

    expect(() => flattenFileEntries(root)).toThrow(/Circular references in config files are not supported/);
  });

  it('should reject objects nested beyond the maximum depth', () => {
    let root: Record<string, unknown> = { value: 'safe' };
    for (let index = 100; index >= 0; index -= 1) {
      root = { [`level${index}`]: root };
    }

    expect(() => flattenFileEntries(root)).toThrow(/Config file nesting exceeds maximum depth of 100/);
  });
});
