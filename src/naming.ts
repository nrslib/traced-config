export function toScreamingSnake(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s.-]+/g, '_')
    .toUpperCase();
}

export function toKebab(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/[\s._]+/g, '-')
    .toLowerCase();
}

const ENV_NAME_BUILDERS = {
  SCREAMING_SNAKE: toScreamingSnake,
} as const;

const ARG_NAME_BUILDERS = {
  kebab: (key: string) => `--${toKebab(key)}`,
} as const;

export function buildDefaultEnvName(key: string, envStyle: keyof typeof ENV_NAME_BUILDERS): string {
  return ENV_NAME_BUILDERS[envStyle](key);
}

export function buildDefaultArgName(key: string, argStyle: keyof typeof ARG_NAME_BUILDERS): string {
  return ARG_NAME_BUILDERS[argStyle](key);
}

export function normalizeArgName(argName: string): string {
  return argName.startsWith('--') ? argName : `--${argName}`;
}
