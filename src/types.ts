export type Origin = 'default' | 'global' | 'local' | 'env' | 'cli';
export type FileLabel = 'global' | 'local';

export type SourceToggles = {
  global: boolean;
  local: boolean;
  env: boolean;
  cli: boolean;
};

export type SchemaEntry<TDefault> = {
  default: TDefault;
  format?: unknown;
  env?: string;
  arg?: string;
  sources?: Partial<SourceToggles>;
};

export type SchemaShape = Record<string, SchemaEntry<unknown>>;

export type InferSchemaValues<TSchema extends SchemaShape> = {
  [K in keyof TSchema]: TSchema[K]['default'];
};

export type TracedValue<TValue> = {
  value: TValue;
  source: string | null;
  origin: Origin;
};

export type ValidateError = {
  key: string;
  value?: unknown;
  source?: string | null;
  origin?: string;
  message?: string;
};

export type TracedConfigOptions<TSchema extends SchemaShape = {}> = {
  envStyle?: 'SCREAMING_SNAKE';
  argStyle?: 'kebab';
  schema?: TSchema;
};

export type FileParser = (content: string) => unknown;
export type FormatValidator = (value: unknown) => boolean;

export type ResolvedSchemaEntry = {
  default: unknown;
  format?: unknown;
  env: string;
  arg: string;
  sources: SourceToggles;
};

export type FileValueRecord = {
  value: unknown;
  source: string;
};

export type CliValue = {
  value: string;
  source: string;
};

export type UnknownKeyIssue = {
  key: string;
  source: string;
  origin: FileLabel;
};

export type TracedConfigApi<TValues extends Record<string, unknown>> = {
  addSchema: <TSchema extends SchemaShape>(schema: TSchema) => TracedConfigApi<TValues & InferSchemaValues<TSchema>>;
  addParser: (extension: string, parser: FileParser) => void;
  addFormat: (name: string, validator: FormatValidator) => void;
  loadFile: (entries: Array<{ path: string; label: FileLabel }>) => Promise<void>;
  get: <TKey extends Extract<keyof TValues, string>>(key: TKey) => TValues[TKey];
  getSource: <TKey extends Extract<keyof TValues, string>>(key: TKey) => string | null;
  getOrigin: <TKey extends Extract<keyof TValues, string>>(key: TKey) => Origin;
  getTraced: <TKey extends Extract<keyof TValues, string>>(key: TKey) => TracedValue<TValues[TKey]>;
  validate: (options?: { strict?: boolean }) => ValidateError[];
};
