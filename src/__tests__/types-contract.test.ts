import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readTypesSource(): Promise<string> {
  return readFile(new URL('../types.ts', import.meta.url), 'utf8');
}

function extractTypeBlock(source: string, typeName: string): string {
  const pattern = new RegExp(`export type ${typeName}[^=]*= \\{([\\s\\S]*?)\\n\\};`);
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Unable to find type block: ${typeName}`);
  }

  return match[1];
}

describe('types contract', () => {
  it('should expose defaultSources in TracedConfigOptions', async () => {
    const source = await readTypesSource();
    const optionsBlock = extractTypeBlock(source, 'TracedConfigOptions');

    expect(optionsBlock).toMatch(/\bdefaultSources\?: Partial<Pick<SourceToggles, 'env' \| 'cli'>>;/);
  });

  it('should require doc metadata in SchemaEntry', async () => {
    const source = await readTypesSource();
    const schemaEntryBlock = extractTypeBlock(source, 'SchemaEntry');

    expect(schemaEntryBlock).toMatch(/\bdoc: string;/);
    expect(schemaEntryBlock).not.toMatch(/\bdoc\?: string;/);
  });

  it('should require message in ValidateError', async () => {
    const source = await readTypesSource();
    const validateErrorBlock = extractTypeBlock(source, 'ValidateError');

    expect(validateErrorBlock).toMatch(/\bmessage: string;/);
    expect(validateErrorBlock).not.toMatch(/\bmessage\?: string;/);
  });

  it('should expose schema introspection api in TracedConfigApi', async () => {
    const source = await readTypesSource();
    const tracedConfigApiBlock = extractTypeBlock(source, 'TracedConfigApi');

    expect(tracedConfigApiBlock).toMatch(/\bgetSchema:\s*\(\)\s*=>/);
  });
});
