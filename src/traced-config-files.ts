import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createDefaultParsers, flattenFileEntries, getFileExtension, isMissingFileError, isPlainObject } from './utils.js';
import type { FileLabel, FileParser, FileValueRecord, UnknownKeyIssue } from './types.js';

export type LoadFileEntry = {
  path: string;
  label: FileLabel;
};

type FileValueStores = {
  globalValues: Map<string, FileValueRecord>;
  localValues: Map<string, FileValueRecord>;
};

export function createParserRegistry(): Map<string, FileParser> {
  return createDefaultParsers();
}

function assertLoadFileEntry(entry: LoadFileEntry): void {
  if (!isPlainObject(entry) || typeof entry.path !== 'string' || (entry.label !== 'global' && entry.label !== 'local')) {
    throw new Error('loadFile entries must be objects with { path, label } where label is global or local');
  }
}

function assignFileValue(
  label: FileLabel,
  key: string,
  value: unknown,
  source: string,
  stores: FileValueStores,
): void {
  if (label === 'global') {
    stores.globalValues.set(key, { value, source });
    return;
  }

  stores.localValues.set(key, { value, source });
}

export async function loadConfigFiles(
  entries: LoadFileEntry[],
  schemaKeys: ReadonlySet<string>,
  parsers: ReadonlyMap<string, FileParser>,
  stores: FileValueStores,
  unknownFileKeys: UnknownKeyIssue[],
): Promise<void> {
  for (const entry of entries) {
    assertLoadFileEntry(entry);

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

    let parsedRaw: unknown;
    try {
      parsedRaw = parser(content);
    } catch {
      throw new Error(`Failed to parse config file '${entry.path}' (label: ${entry.label})`);
    }

    const parsedEntries = isPlainObject(parsedRaw) ? flattenFileEntries(parsedRaw, schemaKeys) : [];
    for (const [key, value] of parsedEntries) {
      if (!schemaKeys.has(key)) {
        unknownFileKeys.push({ key, source: entry.path, origin: entry.label });
        continue;
      }

      assignFileValue(entry.label, key, value, entry.path, stores);
    }
  }
}
