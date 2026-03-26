import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InferSchemaValues, SchemaShape, TracedConfigApi, TracedConfigOptions } from '../index.js';

type EmptySchema = Record<string, never>;

async function createConfig<TSchema extends SchemaShape = EmptySchema>(
  options: TracedConfigOptions<TSchema> = {} as TracedConfigOptions<TSchema>,
): Promise<TracedConfigApi<InferSchemaValues<TSchema>>> {
  const mod = (await import('../index.js')) as {
    tracedConfig?: <TLoadedSchema extends SchemaShape = EmptySchema>(
      loadedOptions?: TracedConfigOptions<TLoadedSchema>,
    ) => TracedConfigApi<InferSchemaValues<TLoadedSchema>>;
  };
  if (typeof mod.tracedConfig !== 'function') {
    throw new Error("Expected module to export tracedConfig(options)");
  }

  return mod.tracedConfig(options);
}

describe('traced-config API contract', () => {
  const originalArgv = [...process.argv];
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.argv = [...originalArgv];
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    process.env = { ...originalEnv };
  });

  it('should export tracedConfig as a function', async () => {
    const mod = (await import('../index.js')) as { tracedConfig?: unknown };

    const exported = mod.tracedConfig;

    expect(typeof exported).toBe('function');
  });

  it('should return default value and default origin for schema key', async () => {
    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080 },
      },
    });

    const value = config.get('port');

    expect(value).toBe(8080);
    expect(config.getSource('port')).toBeNull();
    expect(config.getOrigin('port')).toBe('default');
    expect(config.getTraced('port')).toEqual({ value: 8080, source: null, origin: 'default' });
  });

  it('should allow adding schema after initialization', async () => {
    const config = await createConfig({ envStyle: 'SCREAMING_SNAKE', argStyle: 'kebab' });

    config.addSchema({
      host: { doc: 'test doc', default: 'localhost' },
    });

    expect(config.get('host')).toBe('localhost');
  });

  it('should return extended typed api from addSchema', async () => {
    const config = await createConfig({
      schema: {
        host: { doc: 'test doc', default: 'localhost' },
      },
    });

    const extended = config.addSchema({
      port: { doc: 'test doc', default: 8080 },
    });

    const acceptsNumber = (value: number): number => value;
    const acceptsString = (value: string): string => value;

    expect(acceptsString(extended.get('host'))).toBe('localhost');
    expect(acceptsNumber(extended.get('port'))).toBe(8080);
  });

  it('should infer get return types from schema default values', async () => {
    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080 },
        host: { doc: 'test doc', default: 'localhost' },
      },
    });

    const acceptsNumber = (value: number): number => value;
    const acceptsString = (value: string): string => value;
    const port = config.get('port');
    const host = config.get('host');

    expect(acceptsNumber(port)).toBe(8080);
    expect(acceptsString(host)).toBe('localhost');
  });

  it('should infer get return types from dotted schema keys', async () => {
    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': { doc: 'test doc', default: 'high' },
      },
    });

    const acceptsString = (value: string): string => value;
    const effort = config.get('provider_options.claude.effort');

    expect(acceptsString(effort)).toBe('high');
  });

  it('should throw when addSchema defines duplicate key', async () => {
    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080 },
      },
    });

    expect(() => {
      config.addSchema({
        port: { doc: 'test doc', default: 3000 },
      });
    }).toThrow(/Schema key 'port' is already defined/);
  });

  it('should reject schema prefix collisions in the initial schema definition', async () => {
    await expect(
      createConfig({
        schema: {
          provider_options: { doc: 'parent doc', default: { enabled: false } },
          'provider_options.claude.effort': { doc: 'child doc', default: 'low' },
        },
      }),
    ).rejects.toThrow(/prefix/i);
  });

  it('should reject schema prefix collisions when addSchema adds a parent key for an existing child key', async () => {
    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': { doc: 'child doc', default: 'low' },
      },
    });

    expect(() => {
      config.addSchema({
        provider_options: { doc: 'parent doc', default: { enabled: false } },
      });
    }).toThrow(/prefix/i);
  });

  it('should reject schema prefix collisions when addSchema adds a child key for an existing parent key', async () => {
    const config = await createConfig({
      schema: {
        provider_options: { doc: 'parent doc', default: { enabled: false } },
      },
    });

    expect(() => {
      config.addSchema({
        'provider_options.claude.effort': { doc: 'child doc', default: 'low' },
      });
    }).toThrow(/prefix/i);
  });

  it('should keep schema unchanged when addSchema rejects prefix collisions within the same call', async () => {
    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080 },
      },
    });

    expect(() => {
      config.addSchema({
        provider_options: { doc: 'parent doc', default: { enabled: false } },
        'provider_options.claude.effort': { doc: 'child doc', default: 'low' },
      });
    }).toThrow(/prefix/i);

    expect(Object.keys(config.getSchema())).toEqual(['port']);
  });

  it('should fail fast for the prefix collision repro schema during schema definition', async () => {
    await expect(
      createConfig({
        schema: {
          provider_options: { doc: 'parent doc', default: { enabled: false } },
          'provider_options.claude.effort': { doc: 'child doc', default: 'low' },
        },
      }),
    ).rejects.toThrow(/prefix/i);
  });

  it('should keep the config valid for loadFile and strict validation after rejecting the repro prefix collision in addSchema', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    await writeFile(globalFile, 'provider_options:\n  claude:\n    effort: high\n', 'utf8');

    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': { doc: 'child doc', default: 'low' },
      },
    });

    expect(() => {
      config.addSchema({
        provider_options: { doc: 'parent doc', default: { enabled: false } },
      });
    }).toThrow(/prefix/i);

    await config.loadFile([{ path: globalFile, label: 'global' }]);

    expect(config.get('provider_options.claude.effort')).toBe('high');
    expect(config.validate({ strict: true })).toEqual([]);

    await rm(dir, { recursive: true, force: true });
  });

  it('should throw when get is called with undefined schema key', async () => {
    const config = await createConfig({ schema: { port: { doc: 'test doc', default: 8080 } } });

    expect(() => config.get('missingKey')).toThrow();
  });

  it('should allow nested schema key names', async () => {
    const config = await createConfig({});

    config.addSchema({
      'db.host': { doc: 'test doc', default: 'localhost' },
    });

    expect(config.get('db.host')).toBe('localhost');
  });

  it('should throw when schema entry doc is missing', async () => {
    const config = await createConfig({});

    expect(() => {
      config.addSchema({
        port: { default: 8080 } as unknown as { doc: string; default: number },
      });
    }).toThrow(/must define a non-empty doc string/);
  });

  it('should throw when schema entry doc is empty', async () => {
    const config = await createConfig({});

    expect(() => {
      config.addSchema({
        port: { doc: '   ', default: 8080 },
      });
    }).toThrow(/must define a non-empty doc string/);
  });

  it('should require object entries with label in loadFile', async () => {
    const config = await createConfig({ schema: { port: { doc: 'test doc', default: 8080 } } });

    await expect(config.loadFile(['./config.yaml' as unknown as { path: string; label: 'global' | 'local' }])).rejects.toThrow();
  });

  it('should skip missing files in loadFile', async () => {
    const config = await createConfig({ schema: { port: { doc: 'test doc', default: 8080 } } });

    await expect(config.loadFile([{ path: '/path/does/not/exist.yaml', label: 'global' }])).resolves.toBeUndefined();

    expect(config.get('port')).toBe(8080);
  });

  it('should load YAML and JSON files in order and prefer later file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    const localFile = join(dir, 'config.json');
    await writeFile(globalFile, 'port: 8080\nhost: global.example\n', 'utf8');
    await writeFile(localFile, JSON.stringify({ port: 9090 }), 'utf8');

    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 3000 },
        host: { doc: 'test doc', default: 'localhost' },
      },
    });

    await config.loadFile([
      { path: globalFile, label: 'global' },
      { path: localFile, label: 'local' },
    ]);

    expect(config.get('port')).toBe(9090);
    expect(config.get('host')).toBe('global.example');
    expect(config.getOrigin('port')).toBe('local');
    expect(config.getSource('port')).toBe(localFile);

    await rm(dir, { recursive: true, force: true });
  });

  it('should load nested YAML and JSON into dotted schema keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    const localFile = join(dir, 'local.json');
    await writeFile(globalFile, 'provider_options:\n  claude:\n    effort: high\n  codex:\n    reasoning_effort: medium\n', 'utf8');
    await writeFile(localFile, JSON.stringify({ provider_options: { codex: { reasoning_effort: 'xhigh' } } }), 'utf8');

    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': { doc: 'test doc', default: 'low' },
        'provider_options.codex.reasoning_effort': { doc: 'test doc', default: 'low' },
      },
    });

    await config.loadFile([
      { path: globalFile, label: 'global' },
      { path: localFile, label: 'local' },
    ]);

    expect(config.get('provider_options.claude.effort')).toBe('high');
    expect(config.get('provider_options.codex.reasoning_effort')).toBe('xhigh');
    expect(config.getOrigin('provider_options.claude.effort')).toBe('global');
    expect(config.getOrigin('provider_options.codex.reasoning_effort')).toBe('local');
    expect(config.getSource('provider_options.codex.reasoning_effort')).toBe(localFile);

    await rm(dir, { recursive: true, force: true });
  });

  it('should load deeply nested YAML into a dotted schema key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    const segments = ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7', 'value'];
    const nestedYaml = segments.reduceRight((child, segment, index) => {
      const indentation = '  '.repeat(index);
      return `${indentation}${segment}:${child === null ? ' safe' : `\n${child}`}`;
    }, null as string | null);

    await writeFile(globalFile, `${nestedYaml}\n`, 'utf8');

    const config = await createConfig({
      schema: {
        'level1.level2.level3.level4.level5.level6.level7.value': {
          doc: 'test doc',
          default: 'fallback',
        },
      },
    });

    await config.loadFile([{ path: globalFile, label: 'global' }]);

    expect(config.get('level1.level2.level3.level4.level5.level6.level7.value')).toBe('safe');
    expect(config.getOrigin('level1.level2.level3.level4.level5.level6.level7.value')).toBe('global');

    await rm(dir, { recursive: true, force: true });
  });

  it('should reject circular references in nested YAML input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    await writeFile(globalFile, 'root: &a\n  self: *a\n', 'utf8');

    const config = await createConfig({
      schema: {
        'root.self': { doc: 'test doc', default: 'fallback' },
      },
    });

    await expect(config.loadFile([{ path: globalFile, label: 'global' }])).rejects.toThrow(
      /Circular references in config files are not supported/,
    );

    await rm(dir, { recursive: true, force: true });
  });

  it('should reject deeply nested JSON input with a controlled error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const localFile = join(dir, 'config.json');
    let payload: Record<string, unknown> = { value: 'safe' };
    for (let index = 100; index >= 0; index -= 1) {
      payload = { [`level${index}`]: payload };
    }

    await writeFile(localFile, JSON.stringify(payload), 'utf8');

    const config = await createConfig({
      schema: {
        'level0.level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.level11.level12.level13.level14.level15.level16.level17.level18.level19.level20.level21.level22.level23.level24.level25.level26.level27.level28.level29.level30.level31.level32.level33.level34.level35.level36.level37.level38.level39.level40.level41.level42.level43.level44.level45.level46.level47.level48.level49.level50.level51.level52.level53.level54.level55.level56.level57.level58.level59.level60.level61.level62.level63.level64.level65.level66.level67.level68.level69.level70.level71.level72.level73.level74.level75.level76.level77.level78.level79.level80.level81.level82.level83.level84.level85.level86.level87.level88.level89.level90.level91.level92.level93.level94.level95.level96.level97.level98.level99.level100.value': {
          doc: 'test doc',
          default: 'fallback',
        },
      },
    });

    await expect(config.loadFile([{ path: localFile, label: 'local' }])).rejects.toThrow(
      /Config file nesting exceeds maximum depth of 100/,
    );

    await rm(dir, { recursive: true, force: true });
  });

  it('should mark loaded value origin and source as global when only global file provides it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    await writeFile(globalFile, 'port: 8080\n', 'utf8');

    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 3000, format: 'port' },
      },
    });

    await config.loadFile([{ path: globalFile, label: 'global' }]);

    expect(config.get('port')).toBe(8080);
    expect(config.getOrigin('port')).toBe('global');
    expect(config.getSource('port')).toBe(globalFile);
    expect(config.getTraced('port')).toEqual({ value: 8080, source: globalFile, origin: 'global' });

    await rm(dir, { recursive: true, force: true });
  });

  it('should prioritize env over local/global/default when env source is enabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const localFile = join(dir, 'config.json');
    await writeFile(localFile, JSON.stringify({ port: 9090 }), 'utf8');

    process.env.PORT = '7070';

    const config = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 3000,
          format: 'port',
          sources: { global: true, local: true, env: true, cli: false },
        },
      },
    });

    await config.loadFile([{ path: localFile, label: 'local' }]);

    expect(config.get('port')).toBe(7070);
    expect(config.getOrigin('port')).toBe('env');
    expect(config.getSource('port')).toBe('PORT');

    await rm(dir, { recursive: true, force: true });
  });

  it('should keep cli disabled by default', async () => {
    process.argv = ['node', 'test', '--port', '9191'];
    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080, format: 'port' },
      },
    });

    const value = config.get('port');

    expect(value).toBe(8080);
    expect(config.getOrigin('port')).toBe('default');
  });

  it('should prioritize cli over env when cli source is enabled', async () => {
    process.env.PORT = '7070';
    process.argv = ['node', 'test', '--port', '9191'];

    const config = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 3000,
          format: 'port',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    const value = config.get('port');

    expect(value).toBe(9191);
    expect(config.getOrigin('port')).toBe('cli');
    expect(config.getSource('port')).toBe('--port');
  });

  it('should cache cli values at initialization even if process.argv changes later', async () => {
    process.argv = ['node', 'test', '--port', '9191'];
    const config = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 3000,
          format: 'port',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    process.argv = ['node', 'test', '--port', '9292'];

    expect(config.get('port')).toBe(9191);
    expect(config.getOrigin('port')).toBe('cli');
    expect(config.getSource('port')).toBe('--port');
  });

  it('should keep cli cache isolated per tracedConfig instance', async () => {
    process.argv = ['node', 'test', '--port', '7111'];
    const first = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 3000,
          format: 'port',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    process.argv = ['node', 'test', '--port', '7222'];
    const second = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 3000,
          format: 'port',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    expect(first.get('port')).toBe(7111);
    expect(second.get('port')).toBe(7222);
  });

  it('should apply default < global < local < env < cli precedence chain', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    const localFile = join(dir, 'local.json');
    await writeFile(globalFile, 'port: 4000\n', 'utf8');
    await writeFile(localFile, JSON.stringify({ port: 5000 }), 'utf8');

    process.env.PORT = '6000';
    process.argv = ['node', 'test', '--port', '7000'];

    const config = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 3000,
          format: 'port',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    await config.loadFile([
      { path: globalFile, label: 'global' },
      { path: localFile, label: 'local' },
    ]);

    expect(config.get('port')).toBe(7000);
    expect(config.getOrigin('port')).toBe('cli');
    expect(config.getSource('port')).toBe('--port');

    await rm(dir, { recursive: true, force: true });
  });

  it('should ignore env value when env source is disabled', async () => {
    process.env.PORT = '7070';
    const config = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 8080,
          format: 'port',
          sources: { global: true, local: true, env: false, cli: false },
        },
      },
    });

    const value = config.get('port');

    expect(value).toBe(8080);
    expect(config.getOrigin('port')).toBe('default');
  });

  it('should auto-generate env and arg names from camelCase key', async () => {
    process.env.TAKT_ANTHROPIC_API_KEY = 'env-secret';
    const config = await createConfig({
      schema: {
        taktAnthropicApiKey: { doc: 'test doc', default: '', sources: { global: true, local: true, env: true, cli: false } },
      },
    });

    const value = config.get('taktAnthropicApiKey');

    expect(value).toBe('env-secret');
    expect(config.getSource('taktAnthropicApiKey')).toBe('TAKT_ANTHROPIC_API_KEY');
    expect(config.getOrigin('taktAnthropicApiKey')).toBe('env');
  });

  it('should auto-generate env name from dotted key', async () => {
    process.env.PROVIDER_OPTIONS_CLAUDE_EFFORT = 'max';
    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': {
          doc: 'test doc',
          default: 'high',
          sources: { global: true, local: true, env: true, cli: false },
        },
      },
    });

    const value = config.get('provider_options.claude.effort');

    expect(value).toBe('max');
    expect(config.getSource('provider_options.claude.effort')).toBe('PROVIDER_OPTIONS_CLAUDE_EFFORT');
    expect(config.getOrigin('provider_options.claude.effort')).toBe('env');
  });

  it('should prioritize manually configured env name over auto-generated name', async () => {
    process.env.CUSTOM_PORT = '7331';
    process.env.PORT = '8081';

    const config = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 8080,
          format: 'port',
          env: 'CUSTOM_PORT',
          sources: { global: true, local: true, env: true, cli: false },
        },
      },
    });

    const value = config.get('port');

    expect(value).toBe(7331);
    expect(config.getSource('port')).toBe('CUSTOM_PORT');
    expect(config.getOrigin('port')).toBe('env');
  });

  it('should prioritize manually configured arg name over auto-generated name', async () => {
    process.argv = ['node', 'test', '--custom-port', '7331', '--port', '8081'];

    const config = await createConfig({
      schema: {
        port: {
          doc: 'test doc',
          default: 8080,
          format: 'port',
          arg: 'custom-port',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    expect(config.get('port')).toBe(7331);
    expect(config.getSource('port')).toBe('--custom-port');
    expect(config.getOrigin('port')).toBe('cli');
  });

  it('should auto-generate cli arg name from dotted key', async () => {
    process.argv = ['node', 'test', '--provider-options-claude-effort', 'max'];

    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': {
          doc: 'test doc',
          default: 'high',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    expect(config.get('provider_options.claude.effort')).toBe('max');
    expect(config.getSource('provider_options.claude.effort')).toBe('--provider-options-claude-effort');
    expect(config.getOrigin('provider_options.claude.effort')).toBe('cli');
  });

  it('should split comma-separated env value for Array format', async () => {
    process.env.TAGS = 'a,b,c';
    const config = await createConfig({
      schema: {
        tags: { doc: 'test doc', default: [] as string[], format: Array, env: 'TAGS', sources: { global: true, local: true, env: true, cli: false } },
      },
    });

    const value = config.get('tags');

    expect(value).toEqual(['a', 'b', 'c']);
    expect(config.getOrigin('tags')).toBe('env');
  });

  it('should split comma-separated cli value for Array format', async () => {
    process.argv = ['node', 'test', '--tags', 'red,green,blue'];
    const config = await createConfig({
      schema: {
        tags: { doc: 'test doc', default: [] as string[], format: Array, sources: { global: true, local: true, env: true, cli: true } },
      },
    });

    const value = config.get('tags');

    expect(value).toEqual(['red', 'green', 'blue']);
    expect(config.getSource('tags')).toBe('--tags');
    expect(config.getOrigin('tags')).toBe('cli');
  });

  it('should return format validation errors from validate()', async () => {
    process.env.PORT = '-1';
    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080, format: 'port', sources: { global: true, local: true, env: true, cli: false } },
      },
    });

    const errors = config.validate();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'port', value: -1 });
    expect(typeof errors[0]?.message).toBe('string');
  });

  it('should validate enum format values', async () => {
    process.env.NODE_ENV = 'staging';
    const config = await createConfig({
      schema: {
        nodeEnv: {
          doc: 'test doc',
          default: 'development',
          format: ['production', 'development', 'test'],
          env: 'NODE_ENV',
          sources: { global: true, local: true, env: true, cli: false },
        },
      },
    });

    const errors = config.validate();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'nodeEnv', value: 'staging' });
  });

  it('should report unregistered string format names from validate()', async () => {
    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080, format: 'prot' },
      },
    });

    const errors = config.validate();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'port', value: 8080 });
    expect(errors[0]?.message).toMatch(/format/i);
    expect(errors[0]?.message).toContain('prot');
  });

  it('should register custom parser and load custom extension file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const customFile = join(dir, 'custom.cfg');
    await writeFile(customFile, 'port=7345\nhost=custom.example\n', 'utf8');

    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080, format: 'port' },
        host: { doc: 'test doc', default: 'localhost' },
      },
    });

    config.addParser('cfg', (content) => {
      const parsed: Record<string, string> = {};
      for (const line of content.split('\n')) {
        const [rawKey, rawValue] = line.split('=');
        if (!rawKey || !rawValue) {
          continue;
        }
        parsed[rawKey.trim()] = rawValue.trim();
      }
      return parsed;
    });

    await config.loadFile([{ path: customFile, label: 'local' }]);

    expect(config.get('port')).toBe('7345');
    expect(config.get('host')).toBe('custom.example');
    expect(config.getOrigin('port')).toBe('local');

    await rm(dir, { recursive: true, force: true });
  });

  it('should include path and label context when file parsing fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const invalidJsonFile = join(dir, 'broken.json');
    await writeFile(invalidJsonFile, '{"port": }', 'utf8');

    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 8080 },
      },
    });

    let caught: unknown;
    try {
      await config.loadFile([{ path: invalidJsonFile, label: 'local' }]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(invalidJsonFile);
    expect((caught as Error).message).toContain('local');

    await rm(dir, { recursive: true, force: true });
  });

  it('should not expose dotenv line contents in parse errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const envFile = join(dir, '.env');
    const secret = 'super-secret-token';
    await writeFile(envFile, `API_TOKEN ${secret}\n`, 'utf8');

    const config = await createConfig({
      schema: {
        apiToken: { doc: 'test doc', default: '' },
      },
    });

    let caught: unknown;
    try {
      await config.loadFile([{ path: envFile, label: 'local' }]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(envFile);
    expect((caught as Error).message).toContain('local');
    expect((caught as Error).message).not.toContain(secret);
    expect((caught as Error).message).not.toContain('API_TOKEN');

    await rm(dir, { recursive: true, force: true });
  });

  it('should expose schema metadata for introspection', async () => {
    const config = await createConfig({
      schema: {
        port: {
          doc: 'Port used by the server',
          default: 8080,
          format: 'port',
          env: 'CUSTOM_PORT',
          arg: 'custom-port',
          sources: { global: true, local: true, env: true, cli: true },
        },
      },
    });

    const getSchema = (config as unknown as { getSchema?: () => Record<string, unknown> }).getSchema;
    expect(typeof getSchema).toBe('function');

    const introspected = getSchema?.();

    expect(introspected).toMatchObject({
      port: {
        doc: 'Port used by the server',
        default: 8080,
        format: 'port',
        env: 'CUSTOM_PORT',
        arg: 'custom-port',
        sources: { global: true, local: true, env: true, cli: true },
      },
    });
  });

  it('should load dotenv files with built-in .env parser', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const envFile = join(dir, '.env');
    await writeFile(envFile, 'host=dotenv.example\nmode=production\n', 'utf8');

    const config = await createConfig({
      schema: {
        host: { doc: 'test doc', default: 'localhost', sources: { env: false } },
        mode: { doc: 'test doc', default: 'development', sources: { env: false } },
      },
    });

    await config.loadFile([{ path: envFile, label: 'local' }]);

    expect(config.get('host')).toBe('dotenv.example');
    expect(config.get('mode')).toBe('production');
    expect(config.getOrigin('host')).toBe('local');
    expect(config.getSource('host')).toBe(envFile);

    await rm(dir, { recursive: true, force: true });
  });

  it('should register custom format and validate with it', async () => {
    const config = await createConfig({
      schema: {
        evenValue: { doc: 'test doc', default: 3, format: 'isEven' },
      },
    });

    config.addFormat('isEven', (value) => typeof value === 'number' && value % 2 === 0);

    const errors = config.validate();

    expect(errors).toEqual([
      expect.objectContaining({
        key: 'evenValue',
        value: 3,
        message: 'isEven validation failed',
      }),
    ]);
  });

  it('should validate nat format values', async () => {
    process.env.NAT_VALUE = '-1';
    const config = await createConfig({
      schema: {
        natValue: { doc: 'test doc', default: 1, format: 'nat', env: 'NAT_VALUE', sources: { global: true, local: true, env: true, cli: false } },
      },
    });

    expect(config.get('natValue')).toBe(-1);
    const errors = config.validate();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'natValue', value: -1, message: 'nat must be a non-negative integer' });
  });

  it('should validate int format values', async () => {
    process.env.INT_VALUE = '1.5';
    const config = await createConfig({
      schema: {
        intValue: { doc: 'test doc', default: 2, format: 'int', env: 'INT_VALUE', sources: { global: true, local: true, env: true, cli: false } },
      },
    });

    expect(config.get('intValue')).toBe(1.5);
    const errors = config.validate();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'intValue', value: 1.5, message: 'int must be an integer' });
  });

  it('should validate url format values', async () => {
    process.env.APP_URL = 'not-a-url';
    const config = await createConfig({
      schema: {
        appUrl: { doc: 'test doc', default: 'https://example.com', format: 'url', env: 'APP_URL', sources: { global: true, local: true, env: true, cli: false } },
      },
    });

    expect(config.get('appUrl')).toBe('not-a-url');
    const errors = config.validate();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'appUrl', value: 'not-a-url', message: 'url must be a valid URL' });
  });

  it('should validate ipaddress format values', async () => {
    process.env.HOST_IP = '999.1.1.1';
    const config = await createConfig({
      schema: {
        hostIp: { doc: 'test doc', default: '127.0.0.1', format: 'ipaddress', env: 'HOST_IP', sources: { global: true, local: true, env: true, cli: false } },
      },
    });

    expect(config.get('hostIp')).toBe('999.1.1.1');
    const errors = config.validate();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ key: 'hostIp', value: '999.1.1.1', message: 'ipaddress must be a valid IPv4 or IPv6 address' });
  });

  it('should include unknown keys with source and origin in strict validation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    await writeFile(globalFile, 'port: 8080\ntypoKey: true\n', 'utf8');

    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 3000, format: 'port' },
      },
    });
    await config.loadFile([{ path: globalFile, label: 'global' }]);

    const errors = config.validate({ strict: true });

    expect(errors.every((error) => typeof error.message === 'string')).toBe(true);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'typoKey', source: globalFile, origin: 'global' }),
      ]),
    );

    await rm(dir, { recursive: true, force: true });
  });

  it('should keep flat leaf-only access for nested file input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    await writeFile(globalFile, 'provider_options:\n  claude:\n    effort: high\n', 'utf8');

    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': { doc: 'test doc', default: 'low' },
      },
    });

    await config.loadFile([{ path: globalFile, label: 'global' }]);

    expect(config.get('provider_options.claude.effort')).toBe('high');
    expect(() => (config as unknown as { get: (key: string) => unknown }).get('provider_options')).toThrow(
      /Schema key 'provider_options' is not defined/,
    );

    await rm(dir, { recursive: true, force: true });
  });

  it('should report flattened unknown nested keys in strict validation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    await writeFile(globalFile, 'provider_options:\n  claude:\n    effort: high\n    unknown_flag: true\n', 'utf8');

    const config = await createConfig({
      schema: {
        'provider_options.claude.effort': { doc: 'test doc', default: 'low' },
      },
    });
    await config.loadFile([{ path: globalFile, label: 'global' }]);

    const errors = config.validate({ strict: true });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'provider_options.claude.unknown_flag',
          source: globalFile,
          origin: 'global',
        }),
      ]),
    );

    await rm(dir, { recursive: true, force: true });
  });

  it('should preserve schema-defined object values from files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const globalFile = join(dir, 'global.yaml');
    const settings = { enabled: true };
    await writeFile(globalFile, JSON.stringify({ settings }), 'utf8');

    const config = await createConfig({
      schema: {
        settings: { doc: 'test doc', default: { enabled: false } },
      },
    });

    await config.loadFile([{ path: globalFile, label: 'global' }]);

    expect(config.get('settings')).toEqual(settings);
    expect(config.validate({ strict: true })).toEqual([]);

    await rm(dir, { recursive: true, force: true });
  });

  it('should not include unknown keys in non-strict validation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'traced-config-test-'));
    const localFile = join(dir, 'config.json');
    await writeFile(localFile, JSON.stringify({ unknownFlag: true }), 'utf8');

    const config = await createConfig({
      schema: {
        port: { doc: 'test doc', default: 3000, format: 'port' },
      },
    });
    await config.loadFile([{ path: localFile, label: 'local' }]);

    const errors = config.validate();

    expect(errors).toEqual([]);

    await rm(dir, { recursive: true, force: true });
  });
});
