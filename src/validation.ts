import type { ResolvedSchemaEntry, ValidateError } from './types.js';

export function coerceInputValue(value: unknown, entry: ResolvedSchemaEntry): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (entry.format === Array) {
    return value.split(',').map((part) => part.trim());
  }

  if (entry.format === Number || entry.format === 'port' || entry.format === 'nat' || entry.format === 'int') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (entry.format === Boolean) {
    if (value === 'true' || value === '1') {
      return true;
    }

    if (value === 'false' || value === '0') {
      return false;
    }

    return value;
  }

  if (entry.format === String) {
    return value;
  }

  if (Array.isArray(entry.default)) {
    return value.split(',').map((part) => part.trim());
  }

  if (typeof entry.default === 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (typeof entry.default === 'boolean') {
    if (value === 'true' || value === '1') {
      return true;
    }

    if (value === 'false' || value === '0') {
      return false;
    }
  }

  return value;
}

export function validateFormatValue(key: string, value: unknown, format: unknown): ValidateError | null {
  if (format === undefined) {
    return null;
  }

  if (Array.isArray(format)) {
    if (!format.includes(value)) {
      return { key, value, message: `Value must be one of: ${format.join(', ')}` };
    }

    return null;
  }

  if (format === String) {
    return typeof value === 'string' ? null : { key, value, message: 'Value must be a string' };
  }

  if (format === Number) {
    return typeof value === 'number' && Number.isFinite(value) ? null : { key, value, message: 'Value must be a number' };
  }

  if (format === Boolean) {
    return typeof value === 'boolean' ? null : { key, value, message: 'Value must be a boolean' };
  }

  if (format === Array) {
    return Array.isArray(value) ? null : { key, value, message: 'Value must be an array' };
  }

  if (format === 'port') {
    const valid = typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65535;
    return valid ? null : { key, value, message: 'port must be 0-65535' };
  }

  if (format === 'nat') {
    const valid = typeof value === 'number' && Number.isInteger(value) && value >= 0;
    return valid ? null : { key, value, message: 'nat must be a non-negative integer' };
  }

  if (format === 'int') {
    const valid = typeof value === 'number' && Number.isInteger(value);
    return valid ? null : { key, value, message: 'int must be an integer' };
  }

  if (format === 'url') {
    if (typeof value !== 'string') {
      return { key, value, message: 'url must be a string' };
    }

    try {
      new URL(value);
      return null;
    } catch {
      return { key, value, message: 'url must be a valid URL' };
    }
  }

  if (format === 'ipaddress') {
    if (typeof value !== 'string') {
      return { key, value, message: 'ipaddress must be a string' };
    }

    const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
    const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1|::)$/;
    return ipv4.test(value) || ipv6.test(value) ? null : { key, value, message: 'ipaddress must be a valid IPv4 or IPv6 address' };
  }

  return null;
}
