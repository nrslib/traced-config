import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('architecture contract', () => {
  it('should keep traced-config entrypoint within the file size limit', async () => {
    const source = await readFile(new URL('../traced-config.ts', import.meta.url), 'utf8');
    const lineCount = source.trimEnd().split('\n').length;

    expect(lineCount).toBeLessThanOrEqual(300);
  });
});
