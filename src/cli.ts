import type { CliValue } from './types.js';

export function parseCli(argv: string[]): Map<string, CliValue> {
  const parsed = new Map<string, CliValue>();

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) {
      continue;
    }

    const equalIndex = token.indexOf('=');
    if (equalIndex !== -1) {
      const name = token.slice(0, equalIndex);
      const value = token.slice(equalIndex + 1);
      parsed.set(name, { value, source: name });
      continue;
    }

    const next = argv[index + 1];
    if (typeof next === 'string' && !next.startsWith('--')) {
      parsed.set(token, { value: next, source: token });
      index += 1;
      continue;
    }

    parsed.set(token, { value: 'true', source: token });
  }

  return parsed;
}
